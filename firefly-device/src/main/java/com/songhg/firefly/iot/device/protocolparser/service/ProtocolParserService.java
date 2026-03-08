package com.songhg.firefly.iot.device.protocolparser.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.ProtocolParserChangedEvent;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserCreateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserQueryDTO;
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
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtocolParserService {

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String STATUS_DISABLED = "DISABLED";
    private static final String VERSION_STATUS_PUBLISHED = "PUBLISHED";
    private static final String DEFAULT_SCOPE_TYPE = "PRODUCT";
    private static final String DEFAULT_DIRECTION = "UPLINK";
    private static final String DEFAULT_PARSER_MODE = "SCRIPT";
    private static final String DEFAULT_FRAME_MODE = "NONE";
    private static final String DEFAULT_SCRIPT_LANGUAGE = "JS";
    private static final String DEFAULT_ERROR_POLICY = "ERROR";
    private static final int DEFAULT_TIMEOUT_MS = 50;
    private static final int MAX_TIMEOUT_MS = 60_000;

    private final ProtocolParserDefinitionMapper definitionMapper;
    private final ProtocolParserVersionMapper versionMapper;
    private final ProductMapper productMapper;
    private final ObjectMapper objectMapper;
    private final EventPublisher eventPublisher;

    @Transactional
    public ProtocolParserVO create(ProtocolParserCreateDTO dto) {
        Product product = getProductOrThrow(dto.getProductId());

        ProtocolParserDefinition definition = new ProtocolParserDefinition();
        definition.setTenantId(TenantContextHolder.getTenantId());
        definition.setProductId(product.getId());
        definition.setCreatedBy(UserContextHolder.getUserId());
        definition.setCurrentVersion(1);
        definition.setStatus(STATUS_DRAFT);
        applyCreatePayload(definition, dto, product.getId());

        definitionMapper.insert(definition);
        log.info("Protocol parser definition created: id={}, productId={}, tenantId={}",
                definition.getId(), definition.getProductId(), definition.getTenantId());
        return toVO(definition);
    }

    public IPage<ProtocolParserVO> list(ProtocolParserQueryDTO query) {
        Page<ProtocolParserDefinition> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ProtocolParserDefinition> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProtocolParserDefinition::getTenantId, TenantContextHolder.getTenantId());
        wrapper.isNull(ProtocolParserDefinition::getDeletedAt);
        if (query.getProductId() != null) {
            wrapper.eq(ProtocolParserDefinition::getProductId, query.getProductId());
        }
        if (notBlank(query.getProtocol())) {
            wrapper.eq(ProtocolParserDefinition::getProtocol, normalizeUpper(query.getProtocol()));
        }
        if (notBlank(query.getTransport())) {
            wrapper.eq(ProtocolParserDefinition::getTransport, normalizeUpper(query.getTransport()));
        }
        if (notBlank(query.getStatus())) {
            wrapper.eq(ProtocolParserDefinition::getStatus, normalizeUpper(query.getStatus()));
        }
        wrapper.orderByDesc(ProtocolParserDefinition::getUpdatedAt);
        wrapper.orderByDesc(ProtocolParserDefinition::getId);
        return definitionMapper.selectPage(page, wrapper).convert(this::toVO);
    }

    public ProtocolParserVO getById(Long id) {
        return toVO(getDefinitionOrThrow(id));
    }

    public ProtocolParserPublishedDTO getDebugDefinition(Long id) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        normalizeAndValidate(definition, definition.getProductId());
        Integer versionNo = definition.getCurrentVersion() == null ? 1 : definition.getCurrentVersion();
        return toPublishedDTO(definition, versionNo);
    }

    @Transactional
    public ProtocolParserVO update(Long id, ProtocolParserUpdateDTO dto) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        ensureDraftVersion(definition);
        applyUpdatePayload(definition, dto);
        normalizeAndValidate(definition, definition.getProductId());

        definitionMapper.updateById(definition);
        log.info("Protocol parser definition updated: id={}, currentVersion={}",
                definition.getId(), definition.getCurrentVersion());
        return toVO(definition);
    }

    @Transactional
    public ProtocolParserVO publish(Long id, String changeLog) {
        ProtocolParserDefinition definition = getDefinitionOrThrow(id);
        normalizeAndValidate(definition, definition.getProductId());

        int versionNo = definition.getCurrentVersion() == null ? 1 : definition.getCurrentVersion();
        ProtocolParserPublishedDTO snapshotDto = toPublishedDTO(definition, versionNo);
        snapshotDto.setStatus(STATUS_ENABLED);
        String snapshotJson = writeJson(snapshotDto, "协议解析发布快照序列化失败");

        ProtocolParserVersion version = versionMapper.selectByDefinitionIdAndVersionNo(definition.getId(), versionNo);
        if (version == null) {
            version = new ProtocolParserVersion();
            version.setDefinitionId(definition.getId());
            version.setVersionNo(versionNo);
            version.setSnapshotJson(snapshotJson);
            version.setPublishStatus(VERSION_STATUS_PUBLISHED);
            version.setChangeLog(trimToNull(changeLog));
            version.setCreatedBy(UserContextHolder.getUserId());
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
            throw new BizException(ResultCode.NOT_FOUND, "协议解析版本不存在");
        }

        ProtocolParserPublishedDTO snapshot = readJson(
                version.getSnapshotJson(),
                ProtocolParserPublishedDTO.class,
                "协议解析版本快照读取失败"
        );
        applyPublishedSnapshot(definition, snapshot);

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
            throw new BizException(ResultCode.CONFLICT, "未发布的解析定义不能启用");
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
        return definitionMapper.selectPublishedByProductIdIgnoreTenant(productId).stream()
                .map(this::resolvePublishedSnapshot)
                .toList();
    }

    private Product getProductOrThrow(Long productId) {
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }

    private ProtocolParserDefinition getDefinitionOrThrow(Long id) {
        ProtocolParserDefinition definition = definitionMapper.selectById(id);
        if (definition == null || definition.getDeletedAt() != null) {
            throw new BizException(ResultCode.NOT_FOUND, "协议解析定义不存在");
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

    private void applyCreatePayload(ProtocolParserDefinition definition, ProtocolParserCreateDTO dto, Long defaultScopeId) {
        definition.setScopeType(dto.getScopeType());
        definition.setScopeId(dto.getScopeId());
        definition.setProtocol(dto.getProtocol());
        definition.setTransport(dto.getTransport());
        definition.setDirection(dto.getDirection());
        definition.setParserMode(dto.getParserMode());
        definition.setFrameMode(dto.getFrameMode());
        definition.setMatchRuleJson(dto.getMatchRuleJson());
        definition.setFrameConfigJson(dto.getFrameConfigJson());
        definition.setParserConfigJson(dto.getParserConfigJson());
        definition.setScriptLanguage(dto.getScriptLanguage());
        definition.setScriptContent(dto.getScriptContent());
        definition.setPluginId(dto.getPluginId());
        definition.setPluginVersion(dto.getPluginVersion());
        definition.setTimeoutMs(dto.getTimeoutMs());
        definition.setErrorPolicy(dto.getErrorPolicy());
        normalizeAndValidate(definition, defaultScopeId);
    }

    private void applyUpdatePayload(ProtocolParserDefinition definition, ProtocolParserUpdateDTO dto) {
        if (dto.getScopeType() != null) {
            definition.setScopeType(dto.getScopeType());
        }
        if (dto.getScopeId() != null) {
            definition.setScopeId(dto.getScopeId());
        }
        if (dto.getProtocol() != null) {
            definition.setProtocol(dto.getProtocol());
        }
        if (dto.getTransport() != null) {
            definition.setTransport(dto.getTransport());
        }
        if (dto.getDirection() != null) {
            definition.setDirection(dto.getDirection());
        }
        if (dto.getParserMode() != null) {
            definition.setParserMode(dto.getParserMode());
        }
        if (dto.getFrameMode() != null) {
            definition.setFrameMode(dto.getFrameMode());
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
            definition.setErrorPolicy(dto.getErrorPolicy());
        }
    }

    private void normalizeAndValidate(ProtocolParserDefinition definition, Long defaultScopeId) {
        definition.setScopeType(defaultIfBlank(normalizeUpper(definition.getScopeType()), DEFAULT_SCOPE_TYPE));
        definition.setScopeId(definition.getScopeId() == null ? defaultScopeId : definition.getScopeId());
        definition.setProtocol(requireUpper(definition.getProtocol(), "协议不能为空"));
        definition.setTransport(requireUpper(definition.getTransport(), "传输层不能为空"));
        definition.setDirection(defaultIfBlank(normalizeUpper(definition.getDirection()), DEFAULT_DIRECTION));
        definition.setParserMode(defaultIfBlank(normalizeUpper(definition.getParserMode()), DEFAULT_PARSER_MODE));
        definition.setFrameMode(defaultIfBlank(normalizeUpper(definition.getFrameMode()), DEFAULT_FRAME_MODE));
        definition.setMatchRuleJson(normalizeJsonObject(definition.getMatchRuleJson(), "matchRuleJson"));
        definition.setFrameConfigJson(normalizeJsonObject(definition.getFrameConfigJson(), "frameConfigJson"));
        definition.setParserConfigJson(normalizeJsonObject(definition.getParserConfigJson(), "parserConfigJson"));
        definition.setScriptLanguage(defaultIfBlank(normalizeUpper(definition.getScriptLanguage()), DEFAULT_SCRIPT_LANGUAGE));
        definition.setScriptContent(blankToNull(definition.getScriptContent()));
        definition.setPluginId(trimToNull(definition.getPluginId()));
        definition.setPluginVersion(trimToNull(definition.getPluginVersion()));
        definition.setTimeoutMs(normalizeTimeout(definition.getTimeoutMs()));
        definition.setErrorPolicy(defaultIfBlank(normalizeUpper(definition.getErrorPolicy()), DEFAULT_ERROR_POLICY));

        switch (definition.getParserMode()) {
            case "SCRIPT" -> {
                if (!notBlank(definition.getScriptContent())) {
                    throw new BizException(ResultCode.PARAM_ERROR, "脚本解析模式必须提供脚本内容");
                }
                definition.setPluginId(null);
                definition.setPluginVersion(null);
            }
            case "PLUGIN" -> {
                if (!notBlank(definition.getPluginId())) {
                    throw new BizException(ResultCode.PARAM_ERROR, "插件解析模式必须提供插件编号");
                }
                definition.setScriptLanguage(null);
                definition.setScriptContent(null);
            }
            case "BUILTIN" -> {
                definition.setScriptLanguage(null);
                definition.setScriptContent(null);
                definition.setPluginId(null);
                definition.setPluginVersion(null);
            }
            default -> throw new BizException(ResultCode.PARAM_ERROR, "不支持的解析模式: " + definition.getParserMode());
        }
    }

    private ProtocolParserPublishedDTO resolvePublishedSnapshot(ProtocolParserDefinition definition) {
        Integer versionNo = definition.getPublishedVersion();
        if (versionNo != null) {
            ProtocolParserVersion version = versionMapper.selectByDefinitionIdAndVersionNo(definition.getId(), versionNo);
            if (version != null && notBlank(version.getSnapshotJson())) {
                ProtocolParserPublishedDTO snapshot =
                        readJson(version.getSnapshotJson(), ProtocolParserPublishedDTO.class, "协议解析发布快照读取失败");
                snapshot.setStatus(definition.getStatus());
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
        dto.setScopeType(definition.getScopeType());
        dto.setScopeId(definition.getScopeId());
        dto.setProtocol(definition.getProtocol());
        dto.setTransport(definition.getTransport());
        dto.setDirection(definition.getDirection());
        dto.setParserMode(definition.getParserMode());
        dto.setFrameMode(definition.getFrameMode());
        dto.setMatchRuleJson(definition.getMatchRuleJson());
        dto.setFrameConfigJson(definition.getFrameConfigJson());
        dto.setParserConfigJson(definition.getParserConfigJson());
        dto.setScriptLanguage(definition.getScriptLanguage());
        dto.setScriptContent(definition.getScriptContent());
        dto.setPluginId(definition.getPluginId());
        dto.setPluginVersion(definition.getPluginVersion());
        dto.setTimeoutMs(definition.getTimeoutMs());
        dto.setErrorPolicy(definition.getErrorPolicy());
        dto.setStatus(definition.getStatus());
        dto.setVersionNo(versionNo);
        return dto;
    }

    private void applyPublishedSnapshot(ProtocolParserDefinition definition, ProtocolParserPublishedDTO snapshot) {
        definition.setScopeType(snapshot.getScopeType());
        definition.setScopeId(snapshot.getScopeId());
        definition.setProtocol(snapshot.getProtocol());
        definition.setTransport(snapshot.getTransport());
        definition.setDirection(snapshot.getDirection());
        definition.setParserMode(snapshot.getParserMode());
        definition.setFrameMode(snapshot.getFrameMode());
        definition.setMatchRuleJson(snapshot.getMatchRuleJson());
        definition.setFrameConfigJson(snapshot.getFrameConfigJson());
        definition.setParserConfigJson(snapshot.getParserConfigJson());
        definition.setScriptLanguage(snapshot.getScriptLanguage());
        definition.setScriptContent(snapshot.getScriptContent());
        definition.setPluginId(snapshot.getPluginId());
        definition.setPluginVersion(snapshot.getPluginVersion());
        definition.setTimeoutMs(snapshot.getTimeoutMs());
        definition.setErrorPolicy(snapshot.getErrorPolicy());
    }

    private ProtocolParserVO toVO(ProtocolParserDefinition definition) {
        ProtocolParserVO vo = new ProtocolParserVO();
        vo.setId(definition.getId());
        vo.setTenantId(definition.getTenantId());
        vo.setProductId(definition.getProductId());
        vo.setScopeType(definition.getScopeType());
        vo.setScopeId(definition.getScopeId());
        vo.setProtocol(definition.getProtocol());
        vo.setTransport(definition.getTransport());
        vo.setDirection(definition.getDirection());
        vo.setParserMode(definition.getParserMode());
        vo.setFrameMode(definition.getFrameMode());
        vo.setMatchRuleJson(definition.getMatchRuleJson());
        vo.setFrameConfigJson(definition.getFrameConfigJson());
        vo.setParserConfigJson(definition.getParserConfigJson());
        vo.setScriptLanguage(definition.getScriptLanguage());
        vo.setScriptContent(definition.getScriptContent());
        vo.setPluginId(definition.getPluginId());
        vo.setPluginVersion(definition.getPluginVersion());
        vo.setTimeoutMs(definition.getTimeoutMs());
        vo.setErrorPolicy(definition.getErrorPolicy());
        vo.setStatus(definition.getStatus());
        vo.setCurrentVersion(definition.getCurrentVersion());
        vo.setPublishedVersion(definition.getPublishedVersion());
        vo.setCreatedBy(definition.getCreatedBy());
        vo.setCreatedAt(definition.getCreatedAt());
        vo.setUpdatedAt(definition.getUpdatedAt());
        return vo;
    }

    private String normalizeJsonObject(String rawJson, String fieldName) {
        String source = defaultIfBlank(rawJson, "{}");
        try {
            JsonNode node = objectMapper.readTree(source);
            if (!node.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, fieldName + " 必须是 JSON 对象");
            }
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + " 不是合法的 JSON");
        }
    }

    private int normalizeTimeout(Integer timeoutMs) {
        int value = timeoutMs == null ? DEFAULT_TIMEOUT_MS : timeoutMs;
        if (value <= 0 || value > MAX_TIMEOUT_MS) {
            throw new BizException(ResultCode.PARAM_ERROR, "timeoutMs 必须在 1 到 " + MAX_TIMEOUT_MS + " 之间");
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
        ProtocolParserChangedEvent event = ProtocolParserChangedEvent.of(
                definition.getTenantId(),
                UserContextHolder.getUserId(),
                definition.getProductId(),
                definition.getId(),
                definition.getPublishedVersion(),
                action
        );
        eventPublisher.publish(EventTopics.PROTOCOL_PARSER_CHANGED, String.valueOf(definition.getProductId()), event);
    }
}
