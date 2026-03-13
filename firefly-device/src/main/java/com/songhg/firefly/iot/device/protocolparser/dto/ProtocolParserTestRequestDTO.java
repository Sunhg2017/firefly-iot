package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "Protocol parser uplink debug request")
public class ProtocolParserTestRequestDTO {

    @Schema(description = "Debug product id override, useful for tenant-scope rules")
    private Long productId;

    @Schema(description = "Protocol", example = "TCP_UDP")
    private String protocol;

    @Schema(description = "Transport", example = "TCP")
    private String transport;

    @Schema(description = "Topic or path", example = "/tcp/data")
    private String topic;

    @Schema(description = "Payload encoding", example = "HEX")
    private String payloadEncoding;

    @Schema(description = "Raw payload")
    private String payload;

    @Schema(description = "Headers or extra context")
    private Map<String, String> headers;

    @Schema(description = "Session id")
    private String sessionId;

    @Schema(description = "Remote address")
    private String remoteAddress;
}
