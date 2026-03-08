package com.songhg.firefly.iot.connector.parser.model;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class ParseContext {

    private String protocol;
    private String transport;
    private String topic;
    private byte[] payload;
    private String payloadText;
    private String payloadHex;
    private Map<String, String> headers;
    private String sessionId;
    private String remoteAddress;
    private Long productId;
    private String productKey;
    private Map<String, Object> config;
}
