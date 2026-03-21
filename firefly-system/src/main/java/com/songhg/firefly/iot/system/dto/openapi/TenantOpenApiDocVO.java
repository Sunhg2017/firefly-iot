package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "租户 OpenAPI 文档响应")
public class TenantOpenApiDocVO {

    @Schema(description = "文档生成时间")
    private LocalDateTime generatedAt;

    @Schema(description = "签名算法")
    private String signatureAlgorithm;

    @Schema(description = "签名原文模板")
    private String canonicalRequestTemplate;

    @Schema(description = "网关地址模板")
    private String gatewayBasePathTemplate;

    @Schema(description = "鉴权请求头说明")
    private List<TenantOpenApiDocAuthHeaderVO> authHeaders = new ArrayList<>();

    @Schema(description = "按服务分组的接口文档")
    private List<TenantOpenApiDocServiceVO> services = new ArrayList<>();
}
