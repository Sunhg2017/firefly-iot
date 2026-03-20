package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationItemDTO;
import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationSyncDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiQueryDTO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiVO;
import com.songhg.firefly.iot.system.entity.OpenApiCatalog;
import com.songhg.firefly.iot.system.mapper.OpenApiCatalogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

    @Transactional
    public void syncRegisteredOpenApis(OpenApiRegistrationSyncDTO request) {
        String serviceCode = normalizeServiceCode(request.getServiceCode());
        List<OpenApiCatalog> currentRows = openApiCatalogMapper.selectList(new LambdaQueryWrapper<OpenApiCatalog>()
                .eq(OpenApiCatalog::getServiceCode, serviceCode));
        Map<String, OpenApiCatalog> staleByCode = new HashMap<>();
        for (OpenApiCatalog item : currentRows) {
            staleByCode.put(item.getCode(), item);
        }

        Set<String> incomingCodes = new LinkedHashSet<>();
        List<OpenApiRegistrationItemDTO> items = request.getItems() == null ? new ArrayList<>() : request.getItems();
        for (OpenApiRegistrationItemDTO item : items) {
            String code = normalizeCode(item.getCode());
            if (!incomingCodes.add(code)) {
                throw new BizException(ResultCode.PARAM_ERROR, "duplicate open api code in sync payload: " + code);
            }

            OpenApiCatalog entity = openApiCatalogMapper.selectOne(new LambdaQueryWrapper<OpenApiCatalog>()
                    .eq(OpenApiCatalog::getCode, code)
                    .last("LIMIT 1"));
            boolean isNew = entity == null;
            if (isNew) {
                entity = new OpenApiCatalog();
                entity.setCode(code);
                entity.setCreatedAt(LocalDateTime.now());
            }

            boolean changed = applyChanges(entity, item.getName(), serviceCode, item.getHttpMethod(), item.getPathPattern(),
                    item.getPermissionCode(), item.getEnabled(), item.getSortOrder(), item.getDescription());
            if (isNew) {
                entity.setUpdatedAt(LocalDateTime.now());
                openApiCatalogMapper.insert(entity);
            } else if (changed) {
                entity.setUpdatedAt(LocalDateTime.now());
                openApiCatalogMapper.updateById(entity);
            }
            staleByCode.remove(code);
        }

        for (OpenApiCatalog stale : staleByCode.values()) {
            openApiCatalogMapper.deleteById(stale.getId());
        }
    }

    private boolean applyChanges(
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
        String normalizedName = trimRequired(name, "open api name is required");
        String normalizedServiceCode = normalizeServiceCode(serviceCode);
        String normalizedHttpMethod = normalizeHttpMethod(httpMethod);
        String normalizedPathPattern = normalizePathPattern(pathPattern);
        String normalizedPermissionCode = trimRequired(permissionCode, "open api permission code is required");
        Boolean normalizedEnabled = Boolean.TRUE.equals(enabled);
        Integer normalizedSortOrder = sortOrder == null ? 0 : sortOrder;
        String normalizedDescription = trimToNull(description);

        boolean changed = false;
        changed |= applyField(entity.getName(), normalizedName, entity::setName);
        changed |= applyField(entity.getServiceCode(), normalizedServiceCode, entity::setServiceCode);
        changed |= applyField(entity.getHttpMethod(), normalizedHttpMethod, entity::setHttpMethod);
        changed |= applyField(entity.getPathPattern(), normalizedPathPattern, entity::setPathPattern);
        changed |= applyField(entity.getPermissionCode(), normalizedPermissionCode, entity::setPermissionCode);
        changed |= applyField(entity.getEnabled(), normalizedEnabled, entity::setEnabled);
        changed |= applyField(entity.getSortOrder(), normalizedSortOrder, entity::setSortOrder);
        changed |= applyField(entity.getDescription(), normalizedDescription, entity::setDescription);
        return changed;
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
        return "/open/" + normalizeServiceCode(serviceCode) + normalizePathPattern(pathPattern);
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

    private <T> boolean applyField(T currentValue, T nextValue, java.util.function.Consumer<T> setter) {
        if (java.util.Objects.equals(currentValue, nextValue)) {
            return false;
        }
        setter.accept(nextValue);
        return true;
    }
}
