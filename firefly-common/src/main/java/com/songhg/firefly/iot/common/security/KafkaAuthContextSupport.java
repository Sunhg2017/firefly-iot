package com.songhg.firefly.iot.common.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.Headers;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;

final class KafkaAuthContextSupport {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private KafkaAuthContextSupport() {
    }

    static AppContext resolveOutboundContext(String payload) {
        AppContext merged = merge(copyOf(AppContextHolder.get()), parsePayloadContext(payload));
        return hasValues(merged) ? merged : null;
    }

    static AppContext resolveInboundContext(Headers headers, String payload) {
        AppContext merged = merge(fromHeaders(headers), parsePayloadContext(payload));
        return hasValues(merged) ? merged : null;
    }

    static void writeHeaders(Headers headers, AppContext context) {
        if (headers == null || context == null) {
            return;
        }
        upsertHeader(headers, AuthConstants.HEADER_TENANT_ID, stringify(context.getTenantId()));
        upsertHeader(headers, AuthConstants.HEADER_USER_ID, stringify(context.getUserId()));
        upsertHeader(headers, AuthConstants.HEADER_USERNAME, trimToNull(context.getUsername()));
        upsertHeader(headers, AuthConstants.HEADER_PLATFORM, trimToNull(context.getPlatform()));
        upsertHeader(headers, AuthConstants.HEADER_APP_KEY_ID, stringify(context.getAppKeyId()));
        upsertHeader(headers, AuthConstants.HEADER_OPEN_API_CODE, trimToNull(context.getOpenApiCode()));
        upsertHeader(headers, AuthConstants.HEADER_GRANTED_PERMISSIONS, joinPermissions(context.getPermissions()));
    }

    static AppContext copyOf(AppContext source) {
        if (source == null) {
            return null;
        }
        AppContext copy = new AppContext();
        copy.setTenantId(source.getTenantId());
        copy.setTenantCode(source.getTenantCode());
        copy.setIsolationLevel(source.getIsolationLevel());
        copy.setUserId(source.getUserId());
        copy.setUsername(source.getUsername());
        copy.setPlatform(source.getPlatform());
        copy.setAppKeyId(source.getAppKeyId());
        copy.setOpenApiCode(source.getOpenApiCode());
        copy.setRoles(source.getRoles());
        copy.setPermissions(source.getPermissions());
        return copy;
    }

    private static AppContext merge(AppContext primary, AppContext fallback) {
        if (!hasValues(primary)) {
            return fallback;
        }
        if (!hasValues(fallback)) {
            return primary;
        }
        if (primary.getTenantId() == null) {
            primary.setTenantId(fallback.getTenantId());
        }
        if (primary.getUserId() == null) {
            primary.setUserId(fallback.getUserId());
        }
        if (primary.getUsername() == null) {
            primary.setUsername(fallback.getUsername());
        }
        if (primary.getPlatform() == null) {
            primary.setPlatform(fallback.getPlatform());
        }
        if (primary.getAppKeyId() == null) {
            primary.setAppKeyId(fallback.getAppKeyId());
        }
        if (primary.getOpenApiCode() == null) {
            primary.setOpenApiCode(fallback.getOpenApiCode());
        }
        if (primary.getPermissions() == null || primary.getPermissions().isEmpty()) {
            primary.setPermissions(fallback.getPermissions());
        }
        return primary;
    }

    private static AppContext fromHeaders(Headers headers) {
        if (headers == null) {
            return null;
        }
        AppContext context = new AppContext();
        context.setTenantId(parseLong(lastHeader(headers, AuthConstants.HEADER_TENANT_ID)));
        context.setUserId(parseLong(lastHeader(headers, AuthConstants.HEADER_USER_ID)));
        context.setUsername(trimToNull(lastHeader(headers, AuthConstants.HEADER_USERNAME)));
        context.setPlatform(trimToNull(lastHeader(headers, AuthConstants.HEADER_PLATFORM)));
        context.setAppKeyId(parseLong(lastHeader(headers, AuthConstants.HEADER_APP_KEY_ID)));
        context.setOpenApiCode(trimToNull(lastHeader(headers, AuthConstants.HEADER_OPEN_API_CODE)));
        context.setPermissions(parsePermissions(lastHeader(headers, AuthConstants.HEADER_GRANTED_PERMISSIONS)));
        return hasValues(context) ? context : null;
    }

    private static AppContext parsePayloadContext(String payload) {
        String normalizedPayload = trimToNull(payload);
        if (normalizedPayload == null || !normalizedPayload.startsWith("{")) {
            return null;
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(normalizedPayload);
            if (root == null || !root.isObject()) {
                return null;
            }
            AppContext context = new AppContext();
            context.setTenantId(parseLong(root.path("tenantId").asText(null)));
            context.setUserId(resolvePayloadUserId(root));
            context.setUsername(trimToNull(root.path("username").asText(null)));
            context.setPlatform(trimToNull(root.path("platform").asText(null)));
            context.setAppKeyId(parseLong(root.path("appKeyId").asText(null)));
            context.setOpenApiCode(trimToNull(root.path("openApiCode").asText(null)));
            context.setPermissions(resolvePayloadPermissions(root));
            return hasValues(context) ? context : null;
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Long resolvePayloadUserId(JsonNode root) {
        Long userId = parseLong(root.path("userId").asText(null));
        if (userId != null) {
            return userId;
        }
        userId = parseLong(root.path("operatorId").asText(null));
        if (userId != null) {
            return userId;
        }
        return parseLong(root.path("targetUserId").asText(null));
    }

    private static Set<String> resolvePayloadPermissions(JsonNode root) {
        JsonNode permissionsNode = root.path("permissions");
        if (permissionsNode.isArray()) {
            Set<String> permissions = new LinkedHashSet<>();
            permissionsNode.forEach(item -> {
                String permission = trimToNull(item.asText(null));
                if (permission != null) {
                    permissions.add(permission);
                }
            });
            return permissions.isEmpty() ? null : permissions;
        }
        Set<String> parsed = parsePermissions(root.path("permissions").asText(null));
        if (parsed != null && !parsed.isEmpty()) {
            return parsed;
        }
        return parsePermissions(root.path("grantedPermissions").asText(null));
    }

    private static void upsertHeader(Headers headers, String headerName, String value) {
        String normalizedValue = trimToNull(value);
        if (normalizedValue == null) {
            return;
        }
        headers.remove(headerName);
        headers.add(headerName, normalizedValue.getBytes(StandardCharsets.UTF_8));
    }

    private static String lastHeader(Headers headers, String headerName) {
        Header header = headers.lastHeader(headerName);
        if (header == null || header.value() == null) {
            return null;
        }
        return new String(header.value(), StandardCharsets.UTF_8);
    }

    private static Set<String> parsePermissions(String rawPermissions) {
        String normalized = trimToNull(rawPermissions);
        if (normalized == null) {
            return null;
        }
        Set<String> permissions = new LinkedHashSet<>();
        for (String part : normalized.split(",")) {
            String permission = trimToNull(part);
            if (permission != null) {
                permissions.add(permission);
            }
        }
        return permissions.isEmpty() ? null : permissions;
    }

    private static String joinPermissions(Set<String> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return null;
        }
        String joined = permissions.stream()
                .filter(Objects::nonNull)
                .map(KafkaAuthContextSupport::trimToNull)
                .filter(Objects::nonNull)
                .reduce((left, right) -> left + "," + right)
                .orElse(null);
        return trimToNull(joined);
    }

    private static Long parseLong(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ignore) {
            return null;
        }
    }

    private static String stringify(Long value) {
        return value == null ? null : String.valueOf(value);
    }

    private static boolean hasValues(AppContext context) {
        return context != null
                && (context.getTenantId() != null
                || context.getUserId() != null
                || trimToNull(context.getUsername()) != null
                || trimToNull(context.getPlatform()) != null
                || context.getAppKeyId() != null
                || trimToNull(context.getOpenApiCode()) != null
                || (context.getPermissions() != null && !context.getPermissions().isEmpty()));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
