package com.songhg.firefly.iot.connector.parser.model;

import lombok.Data;

import java.util.Map;

@Data
public class ParsedMessage {

    private String messageId;
    private String type;
    private String topic;
    private Map<String, Object> payload;
    private Long timestamp;
    private String deviceName;
}
