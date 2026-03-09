package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class ProtocolParserReleaseMatcher {

    private final ObjectMapper objectMapper;

    public boolean matches(ProtocolParserPublishedDTO definition, ResolvedDeviceContext deviceContext) {
        if (deviceContext == null) {
            return true;
        }
        return matches(
                definition,
                deviceContext.getDeviceId(),
                deviceContext.getDeviceName(),
                deviceContext.getProductKey()
        );
    }

    public boolean matches(ProtocolParserPublishedDTO definition,
                           Long deviceId,
                           String deviceName,
                           String productKey) {
        String releaseMode = upper(definition.getReleaseMode());
        if (releaseMode == null || "ALL".equals(releaseMode)) {
            return true;
        }
        JsonNode root = readJsonNode(definition.getReleaseConfigJson());
        return switch (releaseMode) {
            case "DEVICE_LIST" -> matchDeviceList(root, deviceId, deviceName);
            case "HASH_PERCENT" -> matchHashPercent(root, deviceId, deviceName, productKey);
            default -> true;
        };
    }

    private boolean matchDeviceList(JsonNode root, Long deviceId, String deviceName) {
        if (deviceId != null && root.path("deviceIds").isArray()) {
            for (JsonNode item : root.path("deviceIds")) {
                if (deviceId.equals(item.asLong())) {
                    return true;
                }
            }
        }
        if (deviceName != null && root.path("deviceNames").isArray()) {
            for (JsonNode item : root.path("deviceNames")) {
                if (deviceName.equalsIgnoreCase(item.asText())) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchHashPercent(JsonNode root, Long deviceId, String deviceName, String productKey) {
        int percent = root.path("percent").asInt(0);
        if (percent <= 0) {
            return false;
        }
        String identity = deviceId != null
                ? String.valueOf(deviceId)
                : firstNotBlank(productKey, "") + ":" + firstNotBlank(deviceName, "");
        int bucket = Math.floorMod(new String(identity.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8).hashCode(), 100);
        return bucket < percent;
    }

    private JsonNode readJsonNode(String json) {
        try {
            return objectMapper.readTree(json == null || json.isBlank() ? "{}" : json);
        } catch (Exception ex) {
            return objectMapper.createObjectNode();
        }
    }

    private String firstNotBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }
}
