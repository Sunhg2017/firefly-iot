package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Map;

@Data
public class ProtocolParserDebugMessageDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String messageId;
    private String type;
    private String topic;
    private Map<String, Object> payload;
    private Long timestamp;
    private String deviceName;
}
