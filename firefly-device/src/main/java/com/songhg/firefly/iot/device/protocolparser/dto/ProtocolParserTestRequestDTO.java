package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "协议解析调试请求")
public class ProtocolParserTestRequestDTO {

    @Schema(description = "协议", example = "TCP_UDP")
    private String protocol;

    @Schema(description = "传输层", example = "TCP")
    private String transport;

    @Schema(description = "主题或路径", example = "/tcp/data")
    private String topic;

    @Schema(description = "负载编码", example = "HEX")
    private String payloadEncoding;

    @Schema(description = "原始负载")
    private String payload;

    @Schema(description = "请求头或扩展上下文")
    private Map<String, String> headers;

    @Schema(description = "会话编号")
    private String sessionId;

    @Schema(description = "远端地址")
    private String remoteAddress;
}
