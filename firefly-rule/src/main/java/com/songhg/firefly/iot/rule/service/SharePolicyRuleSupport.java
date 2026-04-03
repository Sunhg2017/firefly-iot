package com.songhg.firefly.iot.rule.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyCreateDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class SharePolicyRuleSupport {

    private final ObjectMapper objectMapper;

    public void validatePolicyMutation(Long ownerTenantId, SharePolicyCreateDTO dto) {
        if (ownerTenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "租户上下文缺失");
        }
        if (dto == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享策略不能为空");
        }
        if (dto.getConsumerTenantId() != null && ownerTenantId.equals(dto.getConsumerTenantId())) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享策略的消费方不能是当前租户");
        }
        if (parseScope(dto.getScope()).isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享范围至少需要一个 productKey 或 deviceName");
        }
        if (dto.getDataPermissions() != null && !dto.getDataPermissions().isBlank()) {
            parsePermissions(dto.getDataPermissions());
        }
        if (dto.getMaskingRules() != null && !dto.getMaskingRules().isBlank()) {
            parseMaskingRules(dto.getMaskingRules());
        }
        validateJsonObject(dto.getRateLimit(), "频率限制");
        validateJsonObject(dto.getValidity(), "有效期");
    }

    public ScopeSelectors parseScope(String rawScope) {
        if (rawScope == null || rawScope.isBlank()) {
            return ScopeSelectors.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(rawScope);
            Set<String> productKeys = new LinkedHashSet<>();
            Set<String> deviceNames = new LinkedHashSet<>();
            collectStringValues(root.get("productKeys"), productKeys);
            collectStringValues(root.get("deviceNames"), deviceNames);
            collectStringValues(root.get("productKey"), productKeys);
            collectStringValues(root.get("deviceName"), deviceNames);
            return new ScopeSelectors(productKeys, deviceNames);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享范围必须是合法的 JSON");
        }
    }

    public PermissionConfig parsePermissions(String rawPermissions) {
        if (rawPermissions == null || rawPermissions.isBlank()) {
            return PermissionConfig.none();
        }
        try {
            JsonNode root = objectMapper.readTree(rawPermissions);
            JsonNode telemetryHistory = root.path("telemetryHistory");
            boolean allowProperties = parsePermissionFlag(root.get("properties"));
            boolean allowTelemetry = parsePermissionFlag(root.get("telemetry"))
                    || telemetryHistory.path("enabled").asBoolean(false);
            Integer maxHistoryDays = telemetryHistory.path("maxDays").canConvertToInt()
                    ? telemetryHistory.path("maxDays").asInt()
                    : null;
            return new PermissionConfig(allowProperties, allowTelemetry, maxHistoryDays);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "数据权限必须是合法的 JSON");
        }
    }

    public Map<String, String> parseMaskingRules(String rawMaskingRules) {
        if (rawMaskingRules == null || rawMaskingRules.isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(rawMaskingRules);
            Map<String, String> rules = new LinkedHashMap<>();
            if (root.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> entry = fields.next();
                    String property = normalizeMaskField(entry.getKey());
                    String strategy = extractMaskStrategy(entry.getValue());
                    if (property != null && strategy != null) {
                        rules.put(property, strategy);
                    }
                }
            } else if (root.isArray()) {
                for (JsonNode item : root) {
                    String property = normalizeMaskField(item.path("field").asText(null));
                    String strategy = extractMaskStrategy(item.path("strategy"));
                    if (property != null && strategy != null) {
                        rules.put(property, strategy);
                    }
                }
            } else {
                throw new BizException(ResultCode.PARAM_ERROR, "脱敏规则必须是 JSON 对象或数组");
            }
            return rules;
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "脱敏规则必须是合法的 JSON");
        }
    }

    public String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "共享审计日志序列化失败");
        }
    }

    public LocalDateTime parseDateTime(String rawValue, String fieldName) {
        if (rawValue == null || rawValue.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(rawValue).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            try {
                return LocalDateTime.parse(rawValue);
            } catch (DateTimeParseException ex) {
                throw new BizException(ResultCode.PARAM_ERROR, fieldName + "必须是合法的 ISO 日期时间");
            }
        }
    }

    public String formatDateTime(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private void validateJsonObject(String rawValue, String label) {
        if (rawValue == null || rawValue.isBlank()) {
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(rawValue);
            if (!root.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, label + "必须是 JSON 对象");
            }
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, label + "必须是合法的 JSON");
        }
    }

    private boolean parsePermissionFlag(JsonNode node) {
        if (node == null || node.isNull()) {
            return false;
        }
        if (node.isBoolean()) {
            return node.asBoolean();
        }
        if (node.isTextual()) {
            String value = node.asText("").trim().toUpperCase();
            return !value.isEmpty() && !"FALSE".equals(value) && !"NONE".equals(value) && !"DISABLED".equals(value);
        }
        if (node.isArray()) {
            return node.size() > 0;
        }
        if (node.isObject()) {
            if (node.path("enabled").isBoolean()) {
                return node.path("enabled").asBoolean();
            }
            String mode = node.path("mode").asText("").trim().toUpperCase();
            if (!mode.isEmpty()) {
                return !"NONE".equals(mode) && !"DISABLED".equals(mode);
            }
            JsonNode allowed = node.get("allowed");
            return allowed != null && allowed.isArray() && allowed.size() > 0;
        }
        return false;
    }

    private void collectStringValues(JsonNode node, Set<String> bucket) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                collectStringValues(item, bucket);
            }
            return;
        }
        if (node.isTextual()) {
            String value = node.asText().trim();
            if (!value.isEmpty()) {
                bucket.add(value);
            }
        }
    }

    private String normalizeMaskField(String field) {
        if (field == null || field.isBlank()) {
            return null;
        }
        int separator = field.lastIndexOf('.');
        String normalized = separator >= 0 ? field.substring(separator + 1) : field;
        normalized = normalized.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String extractMaskStrategy(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual()) {
            String strategy = node.asText().trim().toUpperCase();
            return strategy.isEmpty() ? null : strategy;
        }
        if (node.isObject()) {
            return extractMaskStrategy(node.get("strategy"));
        }
        return null;
    }

    public record ScopeSelectors(Set<String> productKeys, Set<String> deviceNames) {

        public static ScopeSelectors empty() {
            return new ScopeSelectors(Set.of(), Set.of());
        }

        public boolean isEmpty() {
            return productKeys.isEmpty() && deviceNames.isEmpty();
        }

        public boolean matches(DeviceBasicVO device) {
            boolean productMatch = productKeys.isEmpty()
                    || (device.getProductKey() != null && productKeys.contains(device.getProductKey()));
            boolean deviceMatch = deviceNames.isEmpty()
                    || (device.getDeviceName() != null && deviceNames.contains(device.getDeviceName()));
            return productMatch && deviceMatch;
        }
    }

    public record PermissionConfig(boolean allowProperties, boolean allowTelemetry, Integer maxHistoryDays) {

        public static PermissionConfig none() {
            return new PermissionConfig(false, false, null);
        }
    }
}
