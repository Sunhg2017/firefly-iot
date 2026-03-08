package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Map;

@Data
public class ProtocolParserDebugRequestDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private ProtocolParserPublishedDTO definition;
    private String productKey;
    private String protocol;
    private String transport;
    private String topic;
    private String payloadEncoding;
    private String payload;
    private Map<String, String> headers;
    private String sessionId;
    private String remoteAddress;
}
