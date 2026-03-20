package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiCreateDTO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiQueryDTO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiUpdateDTO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiVO;
import com.songhg.firefly.iot.system.entity.OpenApiCatalog;
import com.songhg.firefly.iot.system.mapper.OpenApiCatalogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class OpenApiCatalogService {

    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]{2,128}$");
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    private final OpenApiCatalogMapper openApiCatalogMapper;

    public IPage<OpenApiVO> listOpenApis(OpenApiQueryDTO query) {
        Page<OpenApiCatalog> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<OpenApiCatalog> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String keyword = query.getKeyword().trim();
            wrapper.and(item -> item.like(OpenApiCatalog::getCode, keyword)
                    .or().like(OpenApiCatalog::getName, keyword)
                    .or().like(OpenApiCatalog::getPathPattern, keyword));
        }
        if (StringUtils.hasText(query.getServiceCode())) {
            wrapper.eq(OpenApiCatalog::getServiceCode, normalizeServiceCode(query.getServiceCode()));
        }
        if (query.getEnabled() != null) {
            wrapper.eq(OpenApiCatalog::getEnabled, query.getEnabled());
        }
        wrapper.orderByAsc(OpenApiCatalog::getSortOrder)
                .orderByAsc(OpenApiCatalog::getCode);
        return openApiCatalogMapper.selectPage(page, wrapper).convert(this::toVO);
    }

    public OpenApiVO getOpenApi(String code) {
        return toVO(requireOpenApi(code));
    }

    public List<OpenApiOptionVO> listAllOptions() {
        return openApiCatalogMapper.selectList(new LambdaQueryWrapper<OpenApiCatalog>()
                        .orderByAsc(OpenApiCatalog::getSortOrder)
                        .orderByAsc(OpenApiCatalog::getCode))
                .stream()
                .map(this::toOption)
                .toList();
    }

    public List<OpenApiOptionVO> listEnabledOptions() {
        return openApiCatalogMapper.selectList(new LambdaQueryWrapper<OpenApiCatalog>()
                        .eq(OpenApiCatalog::getEnabled, true)
                        .orderByAsc(OpenApiCatalog::getSortOrder)
                        .orderByAsc(OpenApiCatalog::getCode))
                .stream()
                .map(this::toOption)
                .toList();
    }

    public Set<String> listEnabledCodes() {
        return new LinkedHashSet<>(openApiCatalogMapper.selectList(new LambdaQueryWrapper<OpenApiCatalog>()
                        .select(OpenApiCatalog::getCode)
                        .eq(OpenApiCatalog::getEnabled, true))
                .stream()
                .map(OpenApiCatalog::getCode)
                .filter(StringUtils::hasText)
                .toList());
    }

    @Transactional
    public OpenApiVO createOpenApi(OpenApiCreateDTO dto) {
        String code = normalizeCode(dto.getCode());
        Long count = openApiCatalogMapper.selectCount(new LambdaQueryWrapper<OpenApiCatalog>()
                .eq(OpenApiCatalog::getCode, code));
        if (count != null && count > 0) {
            throw new BizException(ResultCode.CONFLICT, "open api code already exists");
        }

        OpenApiCatalog entity = new OpenApiCatalog();
        entity.setCode(code);
        applyChanges(entity, dto.getName(), dto.getServiceCode(), dto.getHttpMethod(), dto.getPathPattern(),
                dto.getPermissionCode(), dto.getEnabled(), dto.getSortOrder(), dto.getDescription());
        entity.setCreatedBy(AppContextHolder.getUserId());
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        openApiCatalogMapper.insert(entity);
        return toVO(entity);
    }

    @Transactional
    public OpenApiVO updateOpenApi(String code, OpenApiUpdateDTO dto) {
        OpenApiCatalog entity = requireOpenApi(code);
        applyChanges(entity, dto.getName(), dto.getServiceCode(), dto.getHttpMethod(), dto.getPathPattern(),
                dto.getPermissionCode(), dto.getEnabled(), dto.getSortOrder(), dto.getDescription());
        entity.setUpdatedAt(LocalDateTime.now());
        openApiCatalogMapper.updateById(entity);
        return toVO(entity);
    }

    @Transactional
    public void deleteOpenApi(String code) {
        OpenApiCatalog entity = requireOpenApi(code);
        openApiCatalogMapper.deleteById(entity.getId());
    }

    public OpenApiCatalog requireOpenApi(String code) {
        OpenApiCatalog entity = openApiCatalogMapper.selectOne(new LambdaQueryWrapper<OpenApiCatalog>()
                .eq(OpenApiCatalog::getCode, normalizeCode(code))
                .last("LIMIT 1"));
        if (entity == null) {
            throw new BizException(ResultCode.NOT_FOUND, "open api not found");
        }
        return entity;
    }

    public OpenApiCatalog matchEnabledOpenApi(String serviceCode, String httpMethod, String requestPath) {
        String normalizedServiceCode = normalizeServiceCode(serviceCode);
        String normalizedMethod = normalizeHttpMethod(httpMethod);
        String normalizedPath = normalizePathPattern(requestPath);
        List<OpenApiCatalog> candidates = openApiCatalogMapper.selectList(new LambdaQueryWrapper<OpenApiCatalog>()
                .eq(OpenApiCatalog::getServiceCode, normalizedServiceCode)
                .eq(OpenApiCatalog::getHttpMethod, normalizedMethod)
                .eq(OpenApiCatalog::getEnabled, true));
        return candidates.stream()
                .filter(item -> pathMatches(item.getPathPattern(), normalizedPath))
                .max(Comparator
                        .comparingInt((OpenApiCatalog item) -> normalizePathPattern(item.getPathPattern()).length())
                        .thenComparing(item -> item.getSortOrder() == null ? 0 : item.getSortOrder()))
                .orElseThrow(() -> new BizException(ResultCode.NOT_FOUND, "open api not published"));
    }

    private void applyChanges(
            OpenApiCatalog entity,
            String name,
            String serviceCode,
            String httpMethod,
            String pathPattern,
            String permissionCode,
            Boolean enabled,
            Integer sortOrder,
            String description
    ) {
        entity.setName(trimRequired(name, "open api name is required"));
        entity.setServiceCode(normalizeServiceCode(serviceCode));
        entity.setHttpMethod(normalizeHttpMethod(httpMethod));
        entity.setPathPattern(normalizePathPattern(pathPattern));
        entity.setPermissionCode(trimToNull(permissionCode));
        entity.setEnabled(Boolean.TRUE.equals(enabled));
        entity.setSortOrder(sortOrder == null ? 0 : sortOrder);
        entity.setDescription(trimToNull(description));
    }

    private OpenApiVO toVO(OpenApiCatalog entity) {
        OpenApiVO vo = new OpenApiVO();
        vo.setCode(entity.getCode());
        vo.setName(entity.getName());
        vo.setServiceCode(entity.getServiceCode());
        vo.setHttpMethod(entity.getHttpMethod());
        vo.setPathPattern(entity.getPathPattern());
        vo.setGatewayPath(buildGatewayPath(entity.getServiceCode(), entity.getPathPattern()));
        vo.setPermissionCode(entity.getPermissionCode());
        vo.setEnabled(entity.getEnabled());
        vo.setSortOrder(entity.getSortOrder());
        vo.setDescription(entity.getDescription());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    private OpenApiOptionVO toOption(OpenApiCatalog entity) {
        OpenApiOptionVO vo = new OpenApiOptionVO();
        vo.setCode(entity.getCode());
        vo.setName(entity.getName());
        vo.setServiceCode(entity.getServiceCode());
        vo.setHttpMethod(entity.getHttpMethod());
        vo.setPathPattern(entity.getPathPattern());
        vo.setGatewayPath(buildGatewayPath(entity.getServiceCode(), entity.getPathPattern()));
        vo.setPermissionCode(entity.getPermissionCode());
        return vo;
    }

    public String buildGatewayPath(String serviceCode, String pathPattern) {
        return "/" + normalizeServiceCode(serviceCode) + normalizePathPattern(pathPattern);
    }

    private boolean pathMatches(String configuredPattern, String requestPath) {
        String normalizedPattern = normalizePathPattern(configuredPattern)
                .replaceAll("\\{[^/]+}", "*");
        return PATH_MATCHER.match(normalizedPattern, requestPath);
    }

    private String normalizeCode(String code) {
        String normalized = trimRequired(code, "open api code is required");
        if (!CODE_PATTERN.matcher(normalized).matches()) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid open api code");
        }
        return normalized;
    }

    private String normalizeServiceCode(String serviceCode) {
        return trimRequired(serviceCode, "service code is required").toUpperCase(Locale.ROOT);
    }

    private String normalizeHttpMethod(String httpMethod) {
        return trimRequired(httpMethod, "http method is required").toUpperCase(Locale.ROOT);
    }

    private String normalizePathPattern(String pathPattern) {
        String normalized = trimRequired(pathPattern, "path pattern is required");
        return normalized.startsWith("/") ? normalized : "/" + normalized;
    }

    private String trimRequired(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
