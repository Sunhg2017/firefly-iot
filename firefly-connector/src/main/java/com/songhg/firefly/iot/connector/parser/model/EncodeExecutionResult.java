package com.songhg.firefly.iot.connector.parser.model;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class EncodeExecutionResult {

    private boolean drop;
    private String topic;
    private String payloadText;
    private String payloadHex;
    private String payloadBase64;
    private List<Integer> payloadBytes;
    private Map<String, Object> payloadJson;
    private Map<String, String> headers;
}
