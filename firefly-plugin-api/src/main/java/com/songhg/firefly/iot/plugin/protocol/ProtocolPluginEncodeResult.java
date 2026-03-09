package com.songhg.firefly.iot.plugin.protocol;

import lombok.Data;

import java.util.Map;

@Data
public class ProtocolPluginEncodeResult {

    private boolean drop;
    private String topic;
    private byte[] payload;
    private String payloadText;
    private String payloadHex;
    private String payloadBase64;
    private Map<String, Object> payloadJson;
    private Map<String, String> headers;
}
