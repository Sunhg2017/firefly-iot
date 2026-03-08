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
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.ParsedMessage;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
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

    public ProtocolParserDebugResponseDTO debug(ProtocolParserDebugRequestDTO request) {
        long start = System.currentTimeMillis();
        ProtocolParserDebugResponseDTO response = new ProtocolParserDebugResponseDTO();
        try {
            ProtocolParserPublishedDTO definition = requireDefinition(request);
            byte[] payload = decodePayload(request.getPayloadEncoding(), request.getPayload());
            ParseContext parseContext = buildDebugContext(request, definition, payload);

            ParseExecutionResult executionResult = execute(definition, parseContext);
            ResolvedDeviceContext resolved = deviceIdentityResolveService.resolve(parseContext, null, executionResult.getIdentity());

            response.setSuccess(true);
            response.setMatchedVersion(definition.getVersionNo());
            response.setIdentity(toIdentityDto(executionResult.getIdentity(), resolved));
            response.setMessages(toMessageDtos(executionResult.getMessages(), resolved, parseContext));
            response.setCostMs(System.currentTimeMillis() - start);
            return response;
        } catch (Exception ex) {
            response.setSuccess(false);
            response.setErrorMessage(ex.getMessage());
            response.setCostMs(System.currentTimeMillis() - start);
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
        if (!"SCRIPT".equals(parserMode)) {
            throw new IllegalArgumentException("Debug currently supports SCRIPT parser only");
        }
        return scriptParserExecutor.execute(definition, parseContext);
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
                .payloadHex(toHex(payload))
                .headers(headers)
                .sessionId(request.getSessionId())
                .remoteAddress(request.getRemoteAddress())
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
        String hex = value.replaceAll("\\s+", "");
        if (hex.length() % 2 != 0) {
            throw new IllegalArgumentException("HEX payload length must be even");
        }
        byte[] result = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            result[i / 2] = (byte) Integer.parseInt(hex.substring(i, i + 2), 16);
        }
        return result;
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

    private String toHex(byte[] payload) {
        StringBuilder builder = new StringBuilder(payload.length * 2);
        for (byte value : payload) {
            builder.append(String.format("%02X", value));
        }
        return builder.toString();
    }
}
