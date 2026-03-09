package com.songhg.firefly.iot.plugin.protocol;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class ProtocolPluginParseContext {

    private String protocol;
    private String transport;
    private String topic;
    private byte[] payload;
    private String payloadText;
    private String payloadHex;
    private Map<String, String> headers;
    private String sessionId;
    private String remoteAddress;
    private Long tenantId;
    private Long productId;
    private String productKey;
    private Long deviceId;
    private String deviceName;
    private Map<String, Object> config;
}
