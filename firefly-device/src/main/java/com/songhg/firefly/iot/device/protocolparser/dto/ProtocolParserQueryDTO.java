package com.songhg.firefly.iot.device.protocolparser.dto;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "协议解析定义分页查询请求")
public class ProtocolParserQueryDTO extends PageQuery {

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "协议")
    private String protocol;

    @Schema(description = "传输层")
    private String transport;

    @Schema(description = "状态")
    private String status;
}
