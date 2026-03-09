package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "Protocol parser downlink encode debug request")
public class ProtocolParserEncodeTestRequestDTO {

    @Schema(description = "Debug product id override, useful for tenant-scope rules")
    private Long productId;

    @Schema(description = "Topic override")
    private String topic;

    @Schema(description = "Message type", example = "PROPERTY_SET")
    private String messageType;

    @Schema(description = "Device id override")
    private Long deviceId;

    @Schema(description = "Device name override")
    private String deviceName;

    @Schema(description = "Headers")
    private Map<String, String> headers;

    @Schema(description = "Session id")
    private String sessionId;

    @Schema(description = "Remote address")
    private String remoteAddress;

    @Schema(description = "Downlink payload object")
    private Map<String, Object> payload;
}
