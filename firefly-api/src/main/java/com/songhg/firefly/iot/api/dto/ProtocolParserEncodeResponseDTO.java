package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Map;

@Data
public class ProtocolParserEncodeResponseDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private Integer matchedVersion;
    private String topic;
    private String payloadEncoding;
    private String payloadText;
    private String payloadHex;
    private Map<String, String> headers;
    private Long costMs;
    private String errorMessage;
}
