package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

@Data
public class ProtocolParserDebugResponseDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private Integer matchedVersion;
    private ProtocolParserDebugIdentityDTO identity;
    private List<ProtocolParserDebugMessageDTO> messages;
    private Long costMs;
    private String errorMessage;
}
