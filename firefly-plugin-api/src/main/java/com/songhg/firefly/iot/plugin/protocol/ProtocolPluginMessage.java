package com.songhg.firefly.iot.plugin.protocol;

import lombok.Data;

import java.util.Map;

@Data
public class ProtocolPluginMessage {

    private String messageId;
    private String type;
    private String topic;
    private Map<String, Object> payload;
    private Long timestamp;
    private String deviceName;
}
