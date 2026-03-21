package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "租户 OpenAPI 字段说明")
public class TenantOpenApiDocFieldVO {

    @Schema(description = "字段路径，例如 data.items[].name")
    private String name;

    @Schema(description = "字段位置，例如 PATH、QUERY、HEADER、BODY、RESPONSE")
    private String location;

    @Schema(description = "字段类型")
    private String type;

    @Schema(description = "是否必填")
    private Boolean required;

    @Schema(description = "字段说明")
    private String description;

    @Schema(description = "示例值")
    private String example;
}
