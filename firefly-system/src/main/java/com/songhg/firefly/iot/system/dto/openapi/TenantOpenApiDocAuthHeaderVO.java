package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "租户 OpenAPI 鉴权请求头说明")
public class TenantOpenApiDocAuthHeaderVO {

    @Schema(description = "请求头名称")
    private String name;

    @Schema(description = "是否必填")
    private Boolean required;

    @Schema(description = "说明")
    private String description;

    @Schema(description = "示例值")
    private String example;
}
