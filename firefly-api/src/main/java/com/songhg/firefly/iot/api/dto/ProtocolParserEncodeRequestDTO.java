package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Map;

@Data
public class ProtocolParserEncodeRequestDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private ProtocolParserPublishedDTO definition;
    private String productKey;
    private Long deviceId;
    private String deviceName;
    private String topic;
    private String messageType;
    private String sessionId;
    private String remoteAddress;
    private Map<String, String> headers;
    private Map<String, Object> payload;
}
