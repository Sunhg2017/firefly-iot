package com.songhg.firefly.iot.connector.parser.plugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.plugin.protocol.ProtocolParserPlugin;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginDeviceIdentity;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginEncodeContext;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginEncodeResult;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginMessage;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseContext;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseResult;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class DemoJsonBridgePlugin implements ProtocolParserPlugin {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String pluginId() {
        return "demo-json-bridge";
    }

    @Override
    public String version() {
        return "1.0.0";
    }

    @Override
    public String displayName() {
        return "Demo JSON Bridge";
    }

    @Override
    public String description() {
        return "Parse JSON uplink envelopes and encode JSON downstream envelopes.";
    }

    @Override
    public boolean supportsEncode() {
        return true;
    }

    @Override
    public ProtocolPluginParseResult parse(ProtocolPluginParseContext context) {
        String payloadText = context.getPayloadText();
        if (payloadText == null || payloadText.isBlank()) {
            return null;
        }

        Map<String, Object> json = parseSimpleJson(payloadText);
        if (json.isEmpty()) {
            return null;
        }

        ProtocolPluginDeviceIdentity identity = new ProtocolPluginDeviceIdentity();
        identity.setMode("BY_DEVICE_NAME");
        identity.setProductKey(context.getProductKey());
        identity.setDeviceName(asString(json.get("deviceName")));

        ProtocolPluginMessage message = new ProtocolPluginMessage();
        message.setType(asString(json.getOrDefault("type", "PROPERTY_REPORT")));
        message.setTopic(context.getTopic());
        Object params = json.get("params");
        message.setPayload(params instanceof Map<?, ?> map ? castMap(map) : json);

        ProtocolPluginParseResult result = new ProtocolPluginParseResult();
        result.setIdentity(identity);
        result.setMessages(List.of(message));
        return result;
    }

    @Override
    public ProtocolPluginEncodeResult encode(ProtocolPluginEncodeContext context) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("id", context.getMessageId());
        envelope.put("type", context.getMessageType());
        envelope.put("deviceName", context.getDeviceName());
        envelope.put("params", context.getPayload());

        ProtocolPluginEncodeResult result = new ProtocolPluginEncodeResult();
        result.setTopic(context.getTopic());
        result.setPayload(toJson(envelope).getBytes(StandardCharsets.UTF_8));
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Map<?, ?> map) {
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, value) -> result.put(String.valueOf(key), value));
        return result;
    }

    private String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private Map<String, Object> parseSimpleJson(String text) {
        // Lightweight parser for the bundled demo plugin to avoid extra dependencies in the SPI example.
        try {
            return objectMapper.readValue(text, LinkedHashMap.class);
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }
}
