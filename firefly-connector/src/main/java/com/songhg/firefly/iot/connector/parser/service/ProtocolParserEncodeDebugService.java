package com.songhg.firefly.iot.connector.parser.service;

import com.songhg.firefly.iot.api.dto.ProtocolParserEncodeRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserEncodeResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolEncodeOutcome;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;

@Service
public class ProtocolParserEncodeDebugService {

    private final ProtocolDownlinkEncodeService protocolDownlinkEncodeService;
    private final ProtocolParserMetricsService metricsService;

    public ProtocolParserEncodeDebugService(ProtocolDownlinkEncodeService protocolDownlinkEncodeService,
                                            ProtocolParserMetricsService metricsService) {
        this.protocolDownlinkEncodeService = protocolDownlinkEncodeService;
        this.metricsService = metricsService;
    }

    public ProtocolParserEncodeResponseDTO debug(ProtocolParserEncodeRequestDTO request) {
        long start = System.currentTimeMillis();
        ProtocolParserEncodeResponseDTO response = new ProtocolParserEncodeResponseDTO();
        try {
            ProtocolParserPublishedDTO definition = requireDefinition(request);
            DownlinkEncodeContext context = DownlinkEncodeContext.builder()
                    .protocol(firstNotBlank(request.getDefinition().getProtocol(), "MQTT"))
                    .transport(firstNotBlank(request.getDefinition().getTransport(), "MQTT"))
                    .topic(firstNotBlank(request.getTopic(), "/sys/debug/down"))
                    .messageType(firstNotBlank(request.getMessageType(), "PROPERTY_SET"))
                    .messageId("debug-encode")
                    .payload(request.getPayload() == null ? new LinkedHashMap<>() : request.getPayload())
                    .timestamp(System.currentTimeMillis())
                    .productId(definition.getProductId())
                    .productKey(request.getProductKey())
                    .deviceId(request.getDeviceId())
                    .deviceName(request.getDeviceName())
                    .headers(request.getHeaders())
                    .sessionId(request.getSessionId())
                    .remoteAddress(request.getRemoteAddress())
                    .build();
            ProtocolEncodeOutcome outcome = protocolDownlinkEncodeService.debugEncode(definition, context);
            response.setSuccess(outcome.isHandled() && !outcome.isDrop());
            response.setMatchedVersion(definition.getVersionNo());
            response.setTopic(outcome.getTopic());
            if (outcome.getPayload() != null) {
                response.setPayloadText(new String(outcome.getPayload(), StandardCharsets.UTF_8));
                response.setPayloadHex(PayloadCodec.toHex(outcome.getPayload()));
                response.setPayloadEncoding(isPrintable(outcome.getPayload()) ? "TEXT" : "HEX");
            }
            response.setHeaders(outcome.getHeaders());
            response.setCostMs(System.currentTimeMillis() - start);
            if (outcome.isDrop()) {
                response.setErrorMessage("Encoder requested drop");
            }
            metricsService.recordDebug("DOWNLINK", response.isSuccess(), response.getCostMs());
            return response;
        } catch (Exception ex) {
            response.setSuccess(false);
            response.setErrorMessage(ex.getMessage());
            response.setCostMs(System.currentTimeMillis() - start);
            metricsService.recordDebug("DOWNLINK", false, response.getCostMs());
            return response;
        }
    }

    private ProtocolParserPublishedDTO requireDefinition(ProtocolParserEncodeRequestDTO request) {
        if (request == null || request.getDefinition() == null) {
            throw new IllegalArgumentException("Protocol parser definition is required");
        }
        return request.getDefinition();
    }

    private boolean isPrintable(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return true;
        }
        String text = new String(payload, StandardCharsets.UTF_8);
        int printable = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (!Character.isISOControl(ch) || Character.isWhitespace(ch)) {
                printable++;
            }
        }
        return printable * 10 >= text.length() * 8;
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
}
