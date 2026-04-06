package com.songhg.firefly.iot.system.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "第三方登录授权地址响应")
public class OauthAuthorizeUrlResponse {

    @Schema(description = "提供商编码")
    private String provider;

    @Schema(description = "动作类型")
    private String action;

    @Schema(description = "授权跳转地址")
    private String authorizeUrl;
}
