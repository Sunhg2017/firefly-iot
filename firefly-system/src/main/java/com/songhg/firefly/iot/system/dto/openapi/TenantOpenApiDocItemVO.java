package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "租户 OpenAPI 接口文档")
public class TenantOpenApiDocItemVO {

    @Schema(description = "接口编码")
    private String code;

    @Schema(description = "接口名称")
    private String name;

    @Schema(description = "接口摘要")
    private String summary;

    @Schema(description = "接口说明")
    private String description;

    @Schema(description = "服务短码")
    private String serviceCode;

    @Schema(description = "服务名称")
    private String serviceName;

    @Schema(description = "HTTP 方法")
    private String httpMethod;

    @Schema(description = "下游路径")
    private String pathPattern;

    @Schema(description = "网关调用地址")
    private String gatewayPath;

    @Schema(description = "透传权限编码")
    private String permissionCode;

    @Schema(description = "请求内容类型")
    private List<String> requestContentTypes = new ArrayList<>();

    @Schema(description = "响应内容类型")
    private String responseContentType;

    @Schema(description = "成功响应状态码")
    private String successStatus;

    @Schema(description = "请求体是否必填")
    private Boolean bodyRequired;

    @Schema(description = "路径、查询和业务请求头参数")
    private List<TenantOpenApiDocFieldVO> parameterFields = new ArrayList<>();

    @Schema(description = "请求体字段说明")
    private List<TenantOpenApiDocFieldVO> requestFields = new ArrayList<>();

    @Schema(description = "响应字段说明")
    private List<TenantOpenApiDocFieldVO> responseFields = new ArrayList<>();

    @Schema(description = "请求示例")
    private String requestExample;

    @Schema(description = "响应示例")
    private String responseExample;

    @Schema(description = "curl 调用示例")
    private String curlExample;

    @Schema(description = "文档补充提示")
    private List<String> warnings = new ArrayList<>();
}
