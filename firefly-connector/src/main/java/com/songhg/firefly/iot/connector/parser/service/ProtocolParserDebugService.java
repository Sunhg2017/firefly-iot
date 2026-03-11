package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugIdentityDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugMessageDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.model.FrameDecodeResult;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.ParsedMessage;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import com.songhg.firefly.iot.plugin.protocol.ProtocolParserPlugin;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginMessage;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtocolParserDebugService {

    private final ObjectMapper objectMapper;
    private final ScriptParserExecutor scriptParserExecutor;
    private final DeviceIdentityResolveService deviceIdentityResolveService;
    private final FrameDecodeEngine frameDecodeEngine;
    private final ProtocolParserPluginRegistry pluginRegistry;
    private final ProtocolParserMetricsService metricsService;

    public ProtocolParserDebugResponseDTO debug(ProtocolParserDebugRequestDTO request) {
        long start = System.currentTimeMillis();
        ProtocolParserDebugResponseDTO response = new ProtocolParserDebugResponseDTO();
        try {
            ProtocolParserPublishedDTO definition = requireDefinition(request);
            byte[] payload = decodePayload(request.getPayloadEncoding(), request.getPayload());
            ParseContext rawContext = buildDebugContext(request, definition, payload);
            List<ParseContext> frameContexts = splitFrames(definition, rawContext);

            response.setSuccess(true);
            response.setMatchedVersion(definition.getVersionNo());
            response.setIdentity(null);
            response.setMessages(new ArrayList<>());
            for (ParseContext parseContext : frameContexts) {
                ParseExecutionResult executionResult = execute(definition, parseContext);
                if (executionResult == null || executionResult.isDrop() || executionResult.isNeedMoreData()) {
                    continue;
                }
                ResolvedDeviceContext resolved = deviceIdentityResolveService.resolve(parseContext, null, executionResult.getIdentity());
                if (response.getIdentity() == null) {
                    response.setIdentity(toIdentityDto(executionResult.getIdentity(), resolved));
                }
                response.getMessages().addAll(toMessageDtos(executionResult.getMessages(), resolved, parseContext));
            }
            response.setCostMs(System.currentTimeMillis() - start);
            metricsService.recordDebug("UPLINK", true, response.getCostMs());
            return response;
        } catch (Exception ex) {
            response.setSuccess(false);
            response.setErrorMessage(ex.getMessage());
            response.setCostMs(System.currentTimeMillis() - start);
            metricsService.recordDebug("UPLINK", false, response.getCostMs());
            return response;
        }
    }

    private ProtocolParserPublishedDTO requireDefinition(ProtocolParserDebugRequestDTO request) {
        if (request == null || request.getDefinition() == null) {
            throw new IllegalArgumentException("Protocol parser definition is required");
        }
        return request.getDefinition();
    }

    private ParseExecutionResult execute(ProtocolParserPublishedDTO definition, ParseContext parseContext) {
        String parserMode = upper(definition.getParserMode());
        if ("SCRIPT".equals(parserMode)) {
            return scriptParserExecutor.execute(definition, parseContext);
        }
        if ("PLUGIN".equals(parserMode)) {
            ProtocolParserPlugin plugin = pluginRegistry.find(definition.getPluginId(), definition.getPluginVersion());
            if (plugin == null || !plugin.supportsParse()) {
                throw new IllegalArgumentException("Configured plugin is not available");
            }
            return convertPluginResult(plugin.parse(
                    com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseContext.builder()
                            .protocol(parseContext.getProtocol())
                            .transport(parseContext.getTransport())
                            .topic(parseContext.getTopic())
                            .payload(parseContext.getPayload())
                            .payloadText(parseContext.getPayloadText())
                            .payloadHex(parseContext.getPayloadHex())
                            .headers(parseContext.getHeaders())
                            .sessionId(parseContext.getSessionId())
                            .remoteAddress(parseContext.getRemoteAddress())
                            .productId(parseContext.getProductId())
                            .productKey(parseContext.getProductKey())
                            .config(parseContext.getConfig())
                            .build()
            ));
        }
        throw new IllegalArgumentException("Unsupported parser mode for debug: " + parserMode);
    }

    private ParseExecutionResult convertPluginResult(ProtocolPluginParseResult pluginResult) {
        if (pluginResult == null) {
            return null;
        }
        ParseExecutionResult result = new ParseExecutionResult();
        result.setDrop(pluginResult.isDrop());
        result.setNeedMoreData(pluginResult.isNeedMoreData());
        if (pluginResult.getIdentity() != null) {
            ParsedDeviceIdentity identity = new ParsedDeviceIdentity();
            identity.setMode(pluginResult.getIdentity().getMode());
            identity.setProductKey(pluginResult.getIdentity().getProductKey());
            identity.setDeviceName(pluginResult.getIdentity().getDeviceName());
            identity.setLocatorType(pluginResult.getIdentity().getLocatorType());
            identity.setLocatorValue(pluginResult.getIdentity().getLocatorValue());
            result.setIdentity(identity);
        }
        if (pluginResult.getMessages() != null) {
            result.setMessages(pluginResult.getMessages().stream().map(this::convertPluginMessage).toList());
        }
        return result;
    }

    private ParsedMessage convertPluginMessage(ProtocolPluginMessage pluginMessage) {
        ParsedMessage message = new ParsedMessage();
        message.setMessageId(pluginMessage.getMessageId());
        message.setType(pluginMessage.getType());
        message.setTopic(pluginMessage.getTopic());
        message.setPayload(pluginMessage.getPayload());
        message.setTimestamp(pluginMessage.getTimestamp());
        message.setDeviceName(pluginMessage.getDeviceName());
        return message;
    }

    private ParseContext buildDebugContext(ProtocolParserDebugRequestDTO request,
                                           ProtocolParserPublishedDTO definition,
                                           byte[] payload) {
        String protocol = firstNotBlank(request.getProtocol(), definition.getProtocol());
        String transport = firstNotBlank(request.getTransport(), definition.getTransport());
        String topic = firstNotBlank(request.getTopic(), "/debug");
        Map<String, String> headers = request.getHeaders() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(request.getHeaders());
        if (request.getRemoteAddress() != null && !headers.containsKey("remoteAddress")) {
            headers.put("remoteAddress", request.getRemoteAddress());
        }
        if (request.getSessionId() != null && !headers.containsKey("sessionId")) {
            headers.put("sessionId", request.getSessionId());
        }
        Map<String, Object> config = readJsonMap(definition.getParserConfigJson());
        config.putIfAbsent("productId", definition.getProductId());
        if (request.getProductKey() != null) {
            config.putIfAbsent("productKey", request.getProductKey());
        }
        return ParseContext.builder()
                .protocol(protocol)
                .transport(transport)
                .topic(topic)
                .payload(payload)
                .payloadText(new String(payload, StandardCharsets.UTF_8))
                .payloadHex(PayloadCodec.toHex(payload))
                .headers(headers)
                .sessionId(firstNotBlank(request.getSessionId(), headers.get("sessionId")))
                .remoteAddress(firstNotBlank(request.getRemoteAddress(), headers.get("remoteAddress")))
                .productId(definition.getProductId())
                .productKey(request.getProductKey())
                .config(config)
                .build();
    }

    private ProtocolParserDebugIdentityDTO toIdentityDto(ParsedDeviceIdentity identity, ResolvedDeviceContext resolved) {
        if (identity == null && resolved == null) {
            return null;
        }
        ProtocolParserDebugIdentityDTO dto = new ProtocolParserDebugIdentityDTO();
        if (identity != null) {
            dto.setMode(identity.getMode());
            dto.setProductKey(identity.getProductKey());
            dto.setDeviceName(identity.getDeviceName());
            dto.setLocatorType(identity.getLocatorType());
            dto.setLocatorValue(identity.getLocatorValue());
        }
        if (resolved != null) {
            dto.setDeviceId(resolved.getDeviceId());
            if (dto.getProductKey() == null) {
                dto.setProductKey(resolved.getProductKey());
            }
            if (dto.getDeviceName() == null) {
                dto.setDeviceName(resolved.getDeviceName());
            }
        }
        return dto;
    }

    private List<ProtocolParserDebugMessageDTO> toMessageDtos(List<ParsedMessage> messages,
                                                              ResolvedDeviceContext resolved,
                                                              ParseContext parseContext) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        List<ProtocolParserDebugMessageDTO> results = new ArrayList<>(messages.size());
        for (ParsedMessage message : messages) {
            ProtocolParserDebugMessageDTO dto = new ProtocolParserDebugMessageDTO();
            dto.setMessageId(message.getMessageId());
            dto.setType(normalizeMessageType(message.getType()).name());
            dto.setTopic(firstNotBlank(message.getTopic(), parseContext.getTopic()));
            dto.setPayload(message.getPayload() == null ? Map.of() : new LinkedHashMap<>(message.getPayload()));
            dto.setTimestamp(message.getTimestamp() == null ? System.currentTimeMillis() : message.getTimestamp());
            dto.setDeviceName(firstNotBlank(message.getDeviceName(), resolved == null ? null : resolved.getDeviceName()));
            results.add(dto);
        }
        return results;
    }

    private DeviceMessage.MessageType normalizeMessageType(String type) {
        if (type == null || type.isBlank()) {
            return DeviceMessage.MessageType.RAW_DATA;
        }
        try {
            return DeviceMessage.MessageType.valueOf(type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return DeviceMessage.MessageType.RAW_DATA;
        }
    }

    private byte[] decodePayload(String payloadEncoding, String payload) {
        String encoding = upper(payloadEncoding);
        String source = payload == null ? "" : payload;
        return switch (encoding == null ? "TEXT" : encoding) {
            case "HEX" -> decodeHex(source);
            case "BASE64" -> Base64.getDecoder().decode(source);
            case "TEXT", "JSON" -> source.getBytes(StandardCharsets.UTF_8);
            default -> throw new IllegalArgumentException("Unsupported payloadEncoding: " + payloadEncoding);
        };
    }

    private byte[] decodeHex(String value) {
        return PayloadCodec.decodeHex(value);
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private String firstNotBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private List<ParseContext> splitFrames(ProtocolParserPublishedDTO definition, ParseContext rawContext) {
        ParseContext frameDecodeContext = ParseContext.builder()
                .protocol(rawContext.getProtocol())
                .transport(rawContext.getTransport())
                .topic(rawContext.getTopic())
                .payload(rawContext.getPayload())
                .payloadText(rawContext.getPayloadText())
                .payloadHex(rawContext.getPayloadHex())
                .headers(rawContext.getHeaders())
                // Avoid writing debug half-packets into runtime session buffer.
                .sessionId(null)
                .remoteAddress(null)
                .productId(rawContext.getProductId())
                .productKey(rawContext.getProductKey())
                .config(rawContext.getConfig())
                .build();
        FrameDecodeResult frameDecodeResult = frameDecodeEngine.decode(definition, frameDecodeContext);
        if (frameDecodeResult.getFrames().isEmpty()) {
            if (frameDecodeResult.isNeedMoreData()) {
                throw new IllegalArgumentException("Payload does not contain a complete frame under current frame config");
            }
            return List.of(rawContext);
        }
        List<ParseContext> contexts = new ArrayList<>(frameDecodeResult.getFrames().size());
        for (byte[] frame : frameDecodeResult.getFrames()) {
            contexts.add(copyContextWithPayload(rawContext, frame));
        }
        return contexts;
    }

    private ParseContext copyContextWithPayload(ParseContext rawContext, byte[] payload) {
        return ParseContext.builder()
                .protocol(rawContext.getProtocol())
                .transport(rawContext.getTransport())
                .topic(rawContext.getTopic())
                .payload(payload)
                .payloadText(new String(payload, StandardCharsets.UTF_8))
                .payloadHex(PayloadCodec.toHex(payload))
                .headers(rawContext.getHeaders())
                .sessionId(rawContext.getSessionId())
                .remoteAddress(rawContext.getRemoteAddress())
                .productId(rawContext.getProductId())
                .productKey(rawContext.getProductKey())
                .config(rawContext.getConfig())
                .build();
    }
}
