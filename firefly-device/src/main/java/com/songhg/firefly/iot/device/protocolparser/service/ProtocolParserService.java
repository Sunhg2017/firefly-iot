package com.songhg.firefly.iot.device.protocolparser.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.IEnum;
import com.songhg.firefly.iot.common.enums.ParserDirection;
import com.songhg.firefly.iot.common.enums.ParserErrorPolicy;
import com.songhg.firefly.iot.common.enums.ParserFrameMode;
import com.songhg.firefly.iot.common.enums.ParserMode;
import com.songhg.firefly.iot.common.enums.ParserReleaseMode;
import com.songhg.firefly.iot.common.enums.ParserScopeType;
import com.songhg.firefly.iot.common.enums.ParserStatus;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.ProtocolParserChangedEvent;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserCreateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserQueryDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserVersionVO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserUpdateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserVO;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserDefinition;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserVersion;
import com.songhg.firefly.iot.device.protocolparser.mapper.ProtocolParserDefinitionMapper;
import com.songhg.firefly.iot.device.protocolparser.mapper.ProtocolParserVersionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtocolParserService {

    private static final ParserStatus STATUS_DRAFT = ParserStatus.DRAFT;
    private static final ParserStatus STATUS_ENABLED = ParserStatus.ENABLED;
    private static final ParserStatus STATUS_DISABLED = ParserStatus.DISABLED;
    private static final String VERSION_STATUS_PUBLISHED = "PUBLISHED";
    private static final ParserScopeType SCOPE_PRODUCT = ParserScopeType.PRODUCT;
    private static final ParserScopeType SCOPE_TENANT = ParserScopeType.TENANT;
    private static final ParserDirection DEFAULT_DIRECTION = ParserDirection.UPLINK;
    private static final ParserMode DEFAULT_PARSER_MODE = ParserMode.SCRIPT;
    private static final ParserFrameMode DEFAULT_FRAME_MODE = ParserFrameMode.NONE;
    private static final String DEFAULT_SCRIPT_LANGUAGE = "JS";
    private static final ParserErrorPolicy DEFAULT_ERROR_POLICY = ParserErrorPolicy.ERROR;
    private static final ParserReleaseMode DEFAULT_RELEASE_MODE = ParserReleaseMode.ALL;
    private static final int DEFAULT_TIMEOUT_MS = 50;
    private static final int MAX_TIMEOUT_MS = 60_000;

    private final ProtocolParserDefinitionMapper definitionMapper;
    private final ProtocolParserVersionMapper versionMapper;
    private final ProductMapper productMapper;
    private final ObjectMapper objectMapper;
    private final EventPublisher eventPublisher;

    @Transactional
    public ProtocolParserVO create(ProtocolParserCreateDTO dto) {
        ProtocolParserDefinition definition = new ProtocolParserDefinition();
        definition.setTenantId(AppContextHolder.getTenantId());
        definition.setCreatedBy(AppContextHolder.getUserId());
        definition.setCurrentVersion(1);
        definition.setStatus(STATUS_DRAFT);
        applyCreatePayload(definition, dto);

        definitionMapper.insert(definition);
        log.info("Protocol parser definition created: id={}, scopeType={}, scopeId={}, tenantId={}",
                definition.getId(), definition.getScopeType(), definition.getScopeId(), definition.getTenantId());
        return toVO(definition);
    }

    public IPage<ProtocolParserVO> list(ProtocolParserQueryDTO query) {
        Page<ProtocolParserDefinition> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ProtocolParserDefinition> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProtocolParserDefinition::getTenantId, AppContextHolder.getTenantId());
        wrapper.isNull(ProtocolParserDefinition::getDeletedAt);
        if (query.getProductId() != null) {
            wrapper.and(item -> item.eq(ProtocolParserDefinition::getProductId, query.getProductId())
                    .or(group -> group.eq(ProtocolParserDefinition::getScopeType, SCOPE_TENANT)
                            .eq(ProtocolParserDefinition::getScopeId, AppContextHolder.getTenantId())));
        }
        if (notBlank(query.getProtocol())) {
            wrapper.eq(ProtocolParserDefinition::getProtocol, normalizeUpper(query.getProtocol()));
        }
        if (notBlank(query.getTransport())) {
            wrapper.eq(ProtocolParserDefinition::getTransport, normalizeUpper(query.getTransport()));
        }
        if (notBlank(query.getStatus())) {
            wrapper.eq(ProtocolParserDefinition::getStatus,
                    parseOptionalEnum(query.getStatus(), ParserStatus.class, "status"));
        }
        wrapper.orderByDesc(ProtocolParserDefinition::getUpdatedAt);
        wrapper.orderByDesc(ProtocolParserDefinition::getId);
        return definitionMapper.selectPage(page, wrapper).convert(this::toVO);
    }

    public ProtocolParserVO getById(Long id) {
        return toVO(getDefinitionOrThrow(id));
    }

    public List<ProtocolParserVersionVO> listVersions(Long id) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        return versionMapper.selectListByDefinitionId(definition.getId()).stream()
                .map(this::toVersionVO)
                .toList();
    }

    public ProtocolParserPublishedDTO getDebugDefinition(Long id) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        normalizeAndValidate(definition);
        Integer versionNo = definition.getCurrentVersion() == null ? 1 : definition.getCurrentVersion();
        return toPublishedDTO(definition, versionNo);
    }

    @Transactional
    public ProtocolParserVO update(Long id, ProtocolParserUpdateDTO dto) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        ensureDraftVersion(definition);
        applyUpdatePayload(definition, dto);
        normalizeAndValidate(definition);

        definitionMapper.updateById(definition);
        log.info("Protocol parser definition updated: id={}, currentVersion={}",
                definition.getId(), definition.getCurrentVersion());
        return toVO(definition);
    }

    @Transactional
    public ProtocolParserVO publish(Long id, String changeLog) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        normalizeAndValidate(definition);

        int versionNo = definition.getCurrentVersion() == null ? 1 : definition.getCurrentVersion();
        ProtocolParserPublishedDTO snapshotDto = toPublishedDTO(definition, versionNo);
        snapshotDto.setStatus(enumValue(STATUS_ENABLED));
        String snapshotJson = writeJson(snapshotDto, "protocol parser snapshot serialize failed");

        ProtocolParserVersion version = versionMapper.selectByDefinitionIdAndVersionNo(definition.getId(), versionNo);
        if (version == null) {
            version = new ProtocolParserVersion();
            version.setDefinitionId(definition.getId());
            version.setVersionNo(versionNo);
            version.setSnapshotJson(snapshotJson);
            version.setPublishStatus(VERSION_STATUS_PUBLISHED);
            version.setChangeLog(trimToNull(changeLog));
            version.setCreatedBy(AppContextHolder.getUserId());
            versionMapper.insert(version);
        } else {
            version.setSnapshotJson(snapshotJson);
            version.setPublishStatus(VERSION_STATUS_PUBLISHED);
            version.setChangeLog(trimToNull(changeLog));
            versionMapper.updateById(version);
        }

        definition.setPublishedVersion(versionNo);
        definition.setStatus(STATUS_ENABLED);
        definitionMapper.updateById(definition);
        publishChangedEvent(definition, ProtocolParserChangedEvent.Action.PUBLISHED);

        log.info("Protocol parser definition published: id={}, versionNo={}", definition.getId(), versionNo);
        return toVO(definition);
    }

    @Transactional
    public ProtocolParserVO rollback(Long id, Integer versionNo) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        ProtocolParserVersion version = versionMapper.selectByDefinitionIdAndVersionNo(definition.getId(), versionNo);
        if (version == null) {
            throw new BizException(ResultCode.NOT_FOUND, "protocol parser version not found");
        }

        ProtocolParserPublishedDTO snapshot = readJson(
                version.getSnapshotJson(),
                ProtocolParserPublishedDTO.class,
                "protocol parser snapshot read failed"
        );
        applyPublishedSnapshot(definition, snapshot);
        normalizeAndValidate(definition);

        Integer maxVersionNo = versionMapper.selectMaxVersionNo(definition.getId());
        int nextVersionNo = Math.max((maxVersionNo == null ? 0 : maxVersionNo) + 1, versionNo + 1);
        definition.setPublishedVersion(versionNo);
        definition.setCurrentVersion(nextVersionNo);
        definition.setStatus(STATUS_ENABLED);
        definitionMapper.updateById(definition);
        publishChangedEvent(definition, ProtocolParserChangedEvent.Action.ROLLED_BACK);

        log.info("Protocol parser definition rolled back: id={}, publishedVersion={}, nextDraftVersion={}",
                definition.getId(), versionNo, nextVersionNo);
        return toVO(definition);
    }

    @Transactional
    public void enable(Long id) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        if (definition.getPublishedVersion() == null) {
            throw new BizException(ResultCode.CONFLICT, "cannot enable parser definition before publish");
        }
        definition.setStatus(STATUS_ENABLED);
        definitionMapper.updateById(definition);
        publishChangedEvent(definition, ProtocolParserChangedEvent.Action.ENABLED);
    }

    @Transactional
    public void disable(Long id) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        definition.setStatus(STATUS_DISABLED);
        definitionMapper.updateById(definition);
        publishChangedEvent(definition, ProtocolParserChangedEvent.Action.DISABLED);
    }

    public List<ProtocolParserPublishedDTO> listPublishedByProductId(Long productId) {
        if (productId == null) {
            return Collections.emptyList();
        }
        Product product = productMapper.selectByIdIgnoreTenant(productId);
        if (product == null) {
            return Collections.emptyList();
        }
        return definitionMapper.selectPublishedByProductAndTenantIgnoreTenant(productId, product.getTenantId()).stream()
                .map(this::resolvePublishedSnapshot)
                .sorted(publishedDefinitionComparator())
                .toList();
    }

    private Product getProductOrThrow(Long productId) {
        Product product = productMapper.selectByIdIgnoreTenant(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }

    private ProtocolParserDefinition getDefinitionOrThrow(Long id) {
        ProtocolParserDefinition definition = definitionMapper.selectById(id);
        if (definition == null || definition.getDeletedAt() != null) {
            throw new BizException(ResultCode.NOT_FOUND, "protocol parser definition not found");
        }
        return definition;
    }

    private void ensureDraftVersion(ProtocolParserDefinition definition) {
        if (definition.getPublishedVersion() == null) {
            return;
        }
        int publishedVersion = definition.getPublishedVersion();
        int currentVersion = definition.getCurrentVersion() == null ? 0 : definition.getCurrentVersion();
        if (currentVersion <= publishedVersion) {
            definition.setCurrentVersion(publishedVersion + 1);
        }
    }

    private void applyCreatePayload(ProtocolParserDefinition definition, ProtocolParserCreateDTO dto) {
        definition.setProductId(dto.getProductId());
        definition.setScopeType(parseOptionalEnum(dto.getScopeType(), ParserScopeType.class, "scopeType"));
        definition.setScopeId(dto.getScopeId());
        definition.setProtocol(dto.getProtocol());
        definition.setTransport(dto.getTransport());
        definition.setDirection(parseOptionalEnum(dto.getDirection(), ParserDirection.class, "direction"));
        definition.setParserMode(parseOptionalEnum(dto.getParserMode(), ParserMode.class, "parserMode"));
        definition.setFrameMode(parseOptionalEnum(dto.getFrameMode(), ParserFrameMode.class, "frameMode"));
        definition.setMatchRuleJson(dto.getMatchRuleJson());
        definition.setFrameConfigJson(dto.getFrameConfigJson());
        definition.setParserConfigJson(dto.getParserConfigJson());
        definition.setVisualConfigJson(dto.getVisualConfigJson());
        definition.setScriptLanguage(dto.getScriptLanguage());
        definition.setScriptContent(dto.getScriptContent());
        definition.setPluginId(dto.getPluginId());
        definition.setPluginVersion(dto.getPluginVersion());
        definition.setTimeoutMs(dto.getTimeoutMs());
        definition.setErrorPolicy(parseOptionalEnum(dto.getErrorPolicy(), ParserErrorPolicy.class, "errorPolicy"));
        definition.setReleaseMode(parseOptionalEnum(dto.getReleaseMode(), ParserReleaseMode.class, "releaseMode"));
        definition.setReleaseConfigJson(dto.getReleaseConfigJson());
        normalizeAndValidate(definition);
    }

    private void applyUpdatePayload(ProtocolParserDefinition definition, ProtocolParserUpdateDTO dto) {
        ParserScopeType scopeType = dto.getScopeType() == null
                ? null
                : parseOptionalEnum(dto.getScopeType(), ParserScopeType.class, "scopeType");
        if (dto.getScopeType() != null) {
            definition.setScopeType(scopeType);
        }
        if (dto.getScopeId() != null) {
            definition.setScopeId(dto.getScopeId());
        }
        if (dto.getProductId() != null || scopeType == SCOPE_TENANT) {
            definition.setProductId(dto.getProductId());
        }
        if (dto.getProtocol() != null) {
            definition.setProtocol(dto.getProtocol());
        }
        if (dto.getTransport() != null) {
            definition.setTransport(dto.getTransport());
        }
        if (dto.getDirection() != null) {
            definition.setDirection(parseOptionalEnum(dto.getDirection(), ParserDirection.class, "direction"));
        }
        if (dto.getParserMode() != null) {
            definition.setParserMode(parseOptionalEnum(dto.getParserMode(), ParserMode.class, "parserMode"));
        }
        if (dto.getFrameMode() != null) {
            definition.setFrameMode(parseOptionalEnum(dto.getFrameMode(), ParserFrameMode.class, "frameMode"));
        }
        if (dto.getMatchRuleJson() != null) {
            definition.setMatchRuleJson(dto.getMatchRuleJson());
        }
        if (dto.getFrameConfigJson() != null) {
            definition.setFrameConfigJson(dto.getFrameConfigJson());
        }
        if (dto.getParserConfigJson() != null) {
            definition.setParserConfigJson(dto.getParserConfigJson());
        }
        if (dto.getVisualConfigJson() != null) {
            definition.setVisualConfigJson(dto.getVisualConfigJson());
        }
        if (dto.getScriptLanguage() != null) {
            definition.setScriptLanguage(dto.getScriptLanguage());
        }
        if (dto.getScriptContent() != null) {
            definition.setScriptContent(dto.getScriptContent());
        }
        if (dto.getPluginId() != null) {
            definition.setPluginId(dto.getPluginId());
        }
        if (dto.getPluginVersion() != null) {
            definition.setPluginVersion(dto.getPluginVersion());
        }
        if (dto.getTimeoutMs() != null) {
            definition.setTimeoutMs(dto.getTimeoutMs());
        }
        if (dto.getErrorPolicy() != null) {
            definition.setErrorPolicy(parseOptionalEnum(dto.getErrorPolicy(), ParserErrorPolicy.class, "errorPolicy"));
        }
        if (dto.getReleaseMode() != null) {
            definition.setReleaseMode(parseOptionalEnum(dto.getReleaseMode(), ParserReleaseMode.class, "releaseMode"));
        }
        if (dto.getReleaseConfigJson() != null) {
            definition.setReleaseConfigJson(dto.getReleaseConfigJson());
        }
    }

    private void normalizeAndValidate(ProtocolParserDefinition definition) {
        Long tenantId = AppContextHolder.getTenantId();
        definition.setScopeType(defaultIfNull(definition.getScopeType(), SCOPE_PRODUCT));
        if (definition.getScopeType() == SCOPE_PRODUCT) {
            if (definition.getProductId() == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "productId is required when scopeType=PRODUCT");
            }
            Product product = getProductOrThrow(definition.getProductId());
            definition.setTenantId(product.getTenantId());
            definition.setScopeId(definition.getScopeId() == null ? product.getId() : definition.getScopeId());
        } else if (definition.getScopeType() == SCOPE_TENANT) {
            definition.setTenantId(tenantId);
            definition.setProductId(null);
            definition.setScopeId(definition.getScopeId() == null ? tenantId : definition.getScopeId());
        } else {
            throw new BizException(ResultCode.PARAM_ERROR, "unsupported scopeType: " + definition.getScopeType());
        }
        definition.setProtocol(requireUpper(definition.getProtocol(), "protocol must not be blank"));
        definition.setTransport(requireUpper(definition.getTransport(), "transport must not be blank"));
        definition.setDirection(defaultIfNull(definition.getDirection(), DEFAULT_DIRECTION));
        definition.setParserMode(defaultIfNull(definition.getParserMode(), DEFAULT_PARSER_MODE));
        definition.setFrameMode(defaultIfNull(definition.getFrameMode(), DEFAULT_FRAME_MODE));
        definition.setMatchRuleJson(normalizeJsonObject(definition.getMatchRuleJson(), "matchRuleJson"));
        definition.setFrameConfigJson(normalizeJsonObject(definition.getFrameConfigJson(), "frameConfigJson"));
        definition.setParserConfigJson(normalizeJsonObject(definition.getParserConfigJson(), "parserConfigJson"));
        definition.setVisualConfigJson(normalizeJsonObject(definition.getVisualConfigJson(), "visualConfigJson"));
        definition.setScriptLanguage(defaultIfBlank(normalizeUpper(definition.getScriptLanguage()), DEFAULT_SCRIPT_LANGUAGE));
        definition.setScriptContent(blankToNull(definition.getScriptContent()));
        definition.setPluginId(trimToNull(definition.getPluginId()));
        definition.setPluginVersion(trimToNull(definition.getPluginVersion()));
        definition.setTimeoutMs(normalizeTimeout(definition.getTimeoutMs()));
        definition.setErrorPolicy(defaultIfNull(definition.getErrorPolicy(), DEFAULT_ERROR_POLICY));
        definition.setReleaseMode(defaultIfNull(definition.getReleaseMode(), DEFAULT_RELEASE_MODE));
        definition.setReleaseConfigJson(normalizeJsonObject(definition.getReleaseConfigJson(), "releaseConfigJson"));
        validateReleaseConfig(definition.getReleaseMode(), definition.getReleaseConfigJson());

        switch (definition.getParserMode()) {
            case SCRIPT -> {
                if (!notBlank(definition.getScriptContent())) {
                    throw new BizException(ResultCode.PARAM_ERROR, "script content is required when parserMode=SCRIPT");
                }
                definition.setPluginId(null);
                definition.setPluginVersion(null);
            }
            case PLUGIN -> {
                if (!notBlank(definition.getPluginId())) {
                    throw new BizException(ResultCode.PARAM_ERROR, "pluginId is required when parserMode=PLUGIN");
                }
                definition.setScriptLanguage(null);
                definition.setScriptContent(null);
            }
            case BUILTIN -> throw new BizException(
                    ResultCode.PARAM_ERROR,
                    "BUILTIN mode is not implemented yet, use SCRIPT or PLUGIN"
            );
            default -> throw new BizException(
                    ResultCode.PARAM_ERROR,
                    "unsupported parserMode: " + enumValue(definition.getParserMode())
            );
        }
    }

    private void validateReleaseConfig(ParserReleaseMode releaseMode, String releaseConfigJson) {
        JsonNode root = readJsonNode(releaseConfigJson);
        switch (releaseMode) {
            case ALL -> {
                return;
            }
            case DEVICE_LIST -> {
                boolean hasDeviceIds = root.path("deviceIds").isArray() && root.path("deviceIds").size() > 0;
                boolean hasDeviceNames = root.path("deviceNames").isArray() && root.path("deviceNames").size() > 0;
                if (!hasDeviceIds && !hasDeviceNames) {
                    throw new BizException(ResultCode.PARAM_ERROR, "DEVICE_LIST release mode requires deviceIds or deviceNames");
                }
            }
            case HASH_PERCENT -> {
                int percent = root.path("percent").asInt(-1);
                if (percent < 1 || percent > 100) {
                    throw new BizException(ResultCode.PARAM_ERROR, "HASH_PERCENT release mode requires percent between 1 and 100");
                }
            }
            default -> throw new BizException(ResultCode.PARAM_ERROR, "unsupported releaseMode: " + releaseMode);
        }
    }

    private ProtocolParserPublishedDTO resolvePublishedSnapshot(ProtocolParserDefinition definition) {
        Integer versionNo = definition.getPublishedVersion();
        if (versionNo != null) {
            ProtocolParserVersion version = versionMapper.selectByDefinitionIdAndVersionNo(definition.getId(), versionNo);
            if (version != null && notBlank(version.getSnapshotJson())) {
                ProtocolParserPublishedDTO snapshot =
                        readJson(version.getSnapshotJson(), ProtocolParserPublishedDTO.class, "protocol parser snapshot read failed");
                snapshot.setStatus(enumValue(definition.getStatus()));
                snapshot.setVersionNo(versionNo);
                return snapshot;
            }
        }
        return toPublishedDTO(definition, versionNo == null ? definition.getCurrentVersion() : versionNo);
    }

    private ProtocolParserPublishedDTO toPublishedDTO(ProtocolParserDefinition definition, Integer versionNo) {
        ProtocolParserPublishedDTO dto = new ProtocolParserPublishedDTO();
        dto.setDefinitionId(definition.getId());
        dto.setTenantId(definition.getTenantId());
        dto.setProductId(definition.getProductId());
        dto.setScopeType(enumValue(definition.getScopeType()));
        dto.setScopeId(definition.getScopeId());
        dto.setProtocol(definition.getProtocol());
        dto.setTransport(definition.getTransport());
        dto.setDirection(enumValue(definition.getDirection()));
        dto.setParserMode(enumValue(definition.getParserMode()));
        dto.setFrameMode(enumValue(definition.getFrameMode()));
        dto.setMatchRuleJson(definition.getMatchRuleJson());
        dto.setFrameConfigJson(definition.getFrameConfigJson());
        dto.setParserConfigJson(definition.getParserConfigJson());
        dto.setVisualConfigJson(definition.getVisualConfigJson());
        dto.setScriptLanguage(definition.getScriptLanguage());
        dto.setScriptContent(definition.getScriptContent());
        dto.setPluginId(definition.getPluginId());
        dto.setPluginVersion(definition.getPluginVersion());
        dto.setTimeoutMs(definition.getTimeoutMs());
        dto.setErrorPolicy(enumValue(definition.getErrorPolicy()));
        dto.setReleaseMode(enumValue(definition.getReleaseMode()));
        dto.setReleaseConfigJson(definition.getReleaseConfigJson());
        dto.setStatus(enumValue(definition.getStatus()));
        dto.setVersionNo(versionNo);
        return dto;
    }

    private void applyPublishedSnapshot(ProtocolParserDefinition definition, ProtocolParserPublishedDTO snapshot) {
        definition.setProductId(snapshot.getProductId());
        definition.setScopeType(parseOptionalEnum(snapshot.getScopeType(), ParserScopeType.class, "scopeType"));
        definition.setScopeId(snapshot.getScopeId());
        definition.setProtocol(snapshot.getProtocol());
        definition.setTransport(snapshot.getTransport());
        definition.setDirection(parseOptionalEnum(snapshot.getDirection(), ParserDirection.class, "direction"));
        definition.setParserMode(parseOptionalEnum(snapshot.getParserMode(), ParserMode.class, "parserMode"));
        definition.setFrameMode(parseOptionalEnum(snapshot.getFrameMode(), ParserFrameMode.class, "frameMode"));
        definition.setMatchRuleJson(snapshot.getMatchRuleJson());
        definition.setFrameConfigJson(snapshot.getFrameConfigJson());
        definition.setParserConfigJson(snapshot.getParserConfigJson());
        definition.setVisualConfigJson(snapshot.getVisualConfigJson());
        definition.setScriptLanguage(snapshot.getScriptLanguage());
        definition.setScriptContent(snapshot.getScriptContent());
        definition.setPluginId(snapshot.getPluginId());
        definition.setPluginVersion(snapshot.getPluginVersion());
        definition.setTimeoutMs(snapshot.getTimeoutMs());
        definition.setErrorPolicy(parseOptionalEnum(snapshot.getErrorPolicy(), ParserErrorPolicy.class, "errorPolicy"));
        definition.setReleaseMode(parseOptionalEnum(snapshot.getReleaseMode(), ParserReleaseMode.class, "releaseMode"));
        definition.setReleaseConfigJson(snapshot.getReleaseConfigJson());
    }

    private ProtocolParserVO toVO(ProtocolParserDefinition definition) {
        ProtocolParserVO vo = new ProtocolParserVO();
        vo.setId(definition.getId());
        vo.setTenantId(definition.getTenantId());
        vo.setProductId(definition.getProductId());
        vo.setScopeType(enumValue(definition.getScopeType()));
        vo.setScopeId(definition.getScopeId());
        vo.setProtocol(definition.getProtocol());
        vo.setTransport(definition.getTransport());
        vo.setDirection(enumValue(definition.getDirection()));
        vo.setParserMode(enumValue(definition.getParserMode()));
        vo.setFrameMode(enumValue(definition.getFrameMode()));
        vo.setMatchRuleJson(definition.getMatchRuleJson());
        vo.setFrameConfigJson(definition.getFrameConfigJson());
        vo.setParserConfigJson(definition.getParserConfigJson());
        vo.setVisualConfigJson(definition.getVisualConfigJson());
        vo.setScriptLanguage(definition.getScriptLanguage());
        vo.setScriptContent(definition.getScriptContent());
        vo.setPluginId(definition.getPluginId());
        vo.setPluginVersion(definition.getPluginVersion());
        vo.setTimeoutMs(definition.getTimeoutMs());
        vo.setErrorPolicy(enumValue(definition.getErrorPolicy()));
        vo.setReleaseMode(enumValue(definition.getReleaseMode()));
        vo.setReleaseConfigJson(definition.getReleaseConfigJson());
        vo.setStatus(enumValue(definition.getStatus()));
        vo.setCurrentVersion(definition.getCurrentVersion());
        vo.setPublishedVersion(definition.getPublishedVersion());
        vo.setCreatedBy(definition.getCreatedBy());
        vo.setCreatedAt(definition.getCreatedAt());
        vo.setUpdatedAt(definition.getUpdatedAt());
        return vo;
    }

    private ProtocolParserVersionVO toVersionVO(ProtocolParserVersion version) {
        ProtocolParserVersionVO vo = new ProtocolParserVersionVO();
        vo.setId(version.getId());
        vo.setDefinitionId(version.getDefinitionId());
        vo.setVersionNo(version.getVersionNo());
        vo.setPublishStatus(version.getPublishStatus());
        vo.setChangeLog(version.getChangeLog());
        vo.setCreatedBy(version.getCreatedBy());
        vo.setCreatedAt(version.getCreatedAt());
        return vo;
    }

    private String normalizeJsonObject(String rawJson, String fieldName) {
        String source = defaultIfBlank(rawJson, "{}");
        try {
            JsonNode node = objectMapper.readTree(source);
            if (!node.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, fieldName + " must be a JSON object");
            }
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + " is not valid JSON");
        }
    }

    private JsonNode readJsonNode(String rawJson) {
        try {
            return objectMapper.readTree(defaultIfBlank(rawJson, "{}"));
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "JSON parsing failed");
        }
    }

    private Comparator<ProtocolParserPublishedDTO> publishedDefinitionComparator() {
        return Comparator
                .comparingInt((ProtocolParserPublishedDTO item) -> scopePriority(item.getScopeType()))
                .thenComparingInt(item -> releasePriority(item.getReleaseMode()))
                .thenComparing(ProtocolParserPublishedDTO::getDefinitionId, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private int scopePriority(String scopeType) {
        return enumValue(SCOPE_PRODUCT).equals(normalizeUpper(scopeType)) ? 0 : 1;
    }

    private int releasePriority(String releaseMode) {
        return enumValue(DEFAULT_RELEASE_MODE).equals(normalizeUpper(releaseMode)) ? 1 : 0;
    }

    private int normalizeTimeout(Integer timeoutMs) {
        int value = timeoutMs == null ? DEFAULT_TIMEOUT_MS : timeoutMs;
        if (value <= 0 || value > MAX_TIMEOUT_MS) {
            throw new BizException(ResultCode.PARAM_ERROR, "timeoutMs must be between 1 and " + MAX_TIMEOUT_MS);
        }
        return value;
    }

    private String requireUpper(String value, String message) {
        String normalized = normalizeUpper(value);
        if (!notBlank(normalized)) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return normalized;
    }

    private String normalizeUpper(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.toUpperCase(Locale.ROOT);
    }

    private boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        return value.trim().isEmpty() ? null : value;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultIfBlank(String value, String defaultValue) {
        return notBlank(value) ? value : defaultValue;
    }

    private <T> T defaultIfNull(T value, T defaultValue) {
        return value == null ? defaultValue : value;
    }

    private <E extends Enum<E> & IEnum<String>> E parseOptionalEnum(String rawValue,
                                                                     Class<E> enumType,
                                                                     String fieldName) {
        String normalized = normalizeUpper(rawValue);
        if (!notBlank(normalized)) {
            return null;
        }
        for (E item : enumType.getEnumConstants()) {
            if (item.getValue().equalsIgnoreCase(normalized) || item.name().equalsIgnoreCase(normalized)) {
                return item;
            }
        }
        throw new BizException(ResultCode.PARAM_ERROR, fieldName + " has unsupported value: " + rawValue);
    }

    private <E extends IEnum<String>> String enumValue(E value) {
        return value == null ? null : value.getValue();
    }

    private String writeJson(Object value, String errorMessage) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, errorMessage);
        }
    }

    private <T> T readJson(String value, Class<T> type, String errorMessage) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, errorMessage);
        }
    }

    private void publishChangedEvent(ProtocolParserDefinition definition, ProtocolParserChangedEvent.Action action) {
        Long productId = definition.getProductId() == null ? 0L : definition.getProductId();
        ProtocolParserChangedEvent event = ProtocolParserChangedEvent.of(
                definition.getTenantId(),
                AppContextHolder.getUserId(),
                productId,
                definition.getId(),
                definition.getPublishedVersion(),
                action
        );
        eventPublisher.publish(EventTopics.PROTOCOL_PARSER_CHANGED, String.valueOf(productId), event);
    }
}
