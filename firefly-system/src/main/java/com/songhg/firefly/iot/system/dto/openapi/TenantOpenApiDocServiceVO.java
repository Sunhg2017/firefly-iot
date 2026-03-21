package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "租户 OpenAPI 服务分组文档")
public class TenantOpenApiDocServiceVO {

    @Schema(description = "服务短码")
    private String serviceCode;

    @Schema(description = "服务名称")
    private String serviceName;

    @Schema(description = "接口数量")
    private Integer apiCount;

    @Schema(description = "微服务文档是否拉取成功")
    private Boolean docAvailable;

    @Schema(description = "文档拉取失败时的说明")
    private String errorMessage;

    @Schema(description = "当前服务下的接口文档")
    private List<TenantOpenApiDocItemVO> items = new ArrayList<>();
}
