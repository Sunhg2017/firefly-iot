package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "协议解析定义发布请求")
public class ProtocolParserPublishDTO {

    @Schema(description = "变更说明")
    private String changeLog;
}
