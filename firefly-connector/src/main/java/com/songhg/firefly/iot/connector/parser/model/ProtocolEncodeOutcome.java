package com.songhg.firefly.iot.connector.parser.model;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class ProtocolEncodeOutcome {

    private boolean handled;
    private boolean drop;
    private String topic;
    private byte[] payload;
    private Map<String, String> headers;
    private String parserMode;

    public static ProtocolEncodeOutcome notHandled() {
        return ProtocolEncodeOutcome.builder()
                .handled(false)
                .drop(false)
                .headers(Map.of())
                .build();
    }

    public static ProtocolEncodeOutcome handled(String topic,
                                                byte[] payload,
                                                Map<String, String> headers,
                                                String parserMode) {
        return ProtocolEncodeOutcome.builder()
                .handled(true)
                .drop(false)
                .topic(topic)
                .payload(payload == null ? new byte[0] : payload)
                .headers(headers == null ? Map.of() : headers)
                .parserMode(parserMode)
                .build();
    }

    public static ProtocolEncodeOutcome dropped(String parserMode) {
        return ProtocolEncodeOutcome.builder()
                .handled(true)
                .drop(true)
                .headers(Map.of())
                .parserMode(parserMode)
                .build();
    }
}
