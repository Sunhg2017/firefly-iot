package com.songhg.firefly.iot.rule.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.DecimalNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
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
import java.math.BigDecimal;
import java.math.RoundingMode;
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
        parseRateLimit(dto.getRateLimit());
        parseValidity(dto.getValidity());
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
            boolean allowEvents = parsePermissionFlag(root.get("events"));
            Integer maxHistoryDays = telemetryHistory.path("maxDays").canConvertToInt()
                    ? telemetryHistory.path("maxDays").asInt()
                    : null;
            return new PermissionConfig(allowProperties, allowTelemetry, allowEvents, maxHistoryDays);
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

    /**
     * 对事件 payload（JSON 对象）应用脱敏规则，字段名口径与遥测属性一致。
     * 非对象 payload 原样返回，避免破坏历史自定义格式。
     */
    public String applyMaskingToPayload(String rawPayload, Map<String, String> rules) {
        if (rawPayload == null || rawPayload.isBlank() || rules == null || rules.isEmpty()) {
            return rawPayload;
        }
        try {
            JsonNode root = objectMapper.readTree(rawPayload);
            if (!root.isObject()) {
                return rawPayload;
            }
            ObjectNode objectNode = (ObjectNode) root;
            for (Map.Entry<String, String> entry : rules.entrySet()) {
                JsonNode value = objectNode.get(entry.getKey());
                if (value == null || value.isNull()) {
                    continue;
                }
                objectNode.set(entry.getKey(), maskJsonValue(value, entry.getValue()));
            }
            return objectMapper.writeValueAsString(objectNode);
        } catch (Exception ex) {
            // 事件 payload 不是标准 JSON 时不做破坏性改写。
            return rawPayload;
        }
    }

    private JsonNode maskJsonValue(JsonNode value, String strategy) {
        if (strategy == null) {
            return value;
        }
        if ("MASK_ALL".equals(strategy)) {
            return TextNode.valueOf("******");
        }
        if ("MASK_MIDDLE".equals(strategy)) {
            return TextNode.valueOf(maskMiddle(value.asText("")));
        }
        if (strategy.startsWith("ROUND_") && value.isNumber()) {
            int scale = parseRoundScale(strategy);
            return DecimalNode.valueOf(value.decimalValue().setScale(scale, RoundingMode.HALF_UP));
        }
        return value;
    }

    private String maskMiddle(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return "******";
        }
        if (rawValue.length() <= 4) {
            return "****";
        }
        int prefix = Math.max(1, rawValue.length() / 4);
        int suffix = Math.max(1, rawValue.length() / 4);
        if (prefix + suffix >= rawValue.length()) {
            return "****";
        }
        return rawValue.substring(0, prefix) + "****" + rawValue.substring(rawValue.length() - suffix);
    }

    private int parseRoundScale(String strategy) {
        try {
            return Integer.parseInt(strategy.substring("ROUND_".length()));
        } catch (NumberFormatException ex) {
            return 2;
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

    /**
     * 解析共享策略的频率限制。支持 {qps, dailyLimit}；负数视为非法配置。
     */
    public RateLimitConfig parseRateLimit(String rawRateLimit) {
        if (rawRateLimit == null || rawRateLimit.isBlank()) {
            return RateLimitConfig.none();
        }
        try {
            JsonNode root = objectMapper.readTree(rawRateLimit);
            if (!root.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, "频率限制必须是 JSON 对象");
            }
            int qps = parseNonNegativeInt(root.get("qps"), "频率限制 qps");
            int dailyLimit = parseNonNegativeInt(root.get("dailyLimit"), "频率限制 dailyLimit");
            return new RateLimitConfig(qps, dailyLimit);
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "频率限制必须是合法的 JSON");
        }
    }

    /**
     * 解析共享策略有效期。startTime / endTime 为空表示该侧不限制。
     */
    public ValidityWindow parseValidity(String rawValidity) {
        if (rawValidity == null || rawValidity.isBlank()) {
            return ValidityWindow.open();
        }
        try {
            JsonNode root = objectMapper.readTree(rawValidity);
            if (!root.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, "有效期必须是 JSON 对象");
            }
            LocalDateTime start = parseDateTime(
                    root.path("startTime").isMissingNode() ? null : root.path("startTime").asText(null),
                    "有效期开始时间");
            LocalDateTime end = parseDateTime(
                    root.path("endTime").isMissingNode() ? null : root.path("endTime").asText(null),
                    "有效期结束时间");
            if (start != null && end != null && end.isBefore(start)) {
                throw new BizException(ResultCode.PARAM_ERROR, "有效期结束时间不能早于开始时间");
            }
            return new ValidityWindow(start, end);
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "有效期必须是合法的 JSON");
        }
    }

    private int parseNonNegativeInt(JsonNode node, String label) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return 0;
        }
        if (!node.canConvertToInt()) {
            throw new BizException(ResultCode.PARAM_ERROR, label + " 必须是整数");
        }
        int value = node.asInt();
        if (value < 0) {
            throw new BizException(ResultCode.PARAM_ERROR, label + " 不能为负数");
        }
        return value;
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

    public record PermissionConfig(boolean allowProperties,
                                   boolean allowTelemetry,
                                   boolean allowEvents,
                                   Integer maxHistoryDays) {

        public static PermissionConfig none() {
            return new PermissionConfig(false, false, false, null);
        }
    }

    public record RateLimitConfig(int qps, int dailyLimit) {

        public static RateLimitConfig none() {
            return new RateLimitConfig(0, 0);
        }

        public boolean isEmpty() {
            return qps <= 0 && dailyLimit <= 0;
        }
    }

    public record ValidityWindow(LocalDateTime start, LocalDateTime end) {

        public static ValidityWindow open() {
            return new ValidityWindow(null, null);
        }

        public boolean isEffectiveAt(LocalDateTime now) {
            if (start != null && now.isBefore(start)) {
                return false;
            }
            return end == null || !now.isAfter(end);
        }
    }
}
