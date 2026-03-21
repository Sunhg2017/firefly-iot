package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "租户可选 OpenAPI 简要信息")
public class TenantOpenApiOptionVO {

    @Schema(description = "OpenAPI 编码")
    private String code;

    @Schema(description = "OpenAPI 名称")
    private String name;

    @Schema(description = "所属服务编码")
    private String serviceCode;

    @Schema(description = "HTTP 方法")
    private String httpMethod;

    @Schema(description = "网关调用地址")
    private String gatewayPath;
}
