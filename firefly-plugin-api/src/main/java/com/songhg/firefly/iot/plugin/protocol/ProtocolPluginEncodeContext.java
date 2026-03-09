package com.songhg.firefly.iot.plugin.protocol;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class ProtocolPluginEncodeContext {

    private String protocol;
    private String transport;
    private String topic;
    private String messageType;
    private String messageId;
    private Map<String, Object> payload;
    private long timestamp;
    private Long tenantId;
    private Long productId;
    private String productKey;
    private Long deviceId;
    private String deviceName;
    private Map<String, String> headers;
    private String sessionId;
    private String remoteAddress;
    private Map<String, Object> config;
}
