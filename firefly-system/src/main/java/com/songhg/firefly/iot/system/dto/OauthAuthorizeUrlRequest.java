package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.OauthProvider;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "第三方登录授权地址请求")
public class OauthAuthorizeUrlRequest {

    @NotNull(message = "provider 不能为空")
    @Schema(description = "第三方提供商")
    private OauthProvider provider;

    @NotBlank(message = "action 不能为空")
    @Schema(description = "动作类型，LOGIN 或 BIND")
    private String action;

    @NotBlank(message = "redirectUri 不能为空")
    @Schema(description = "第三方回调地址")
    private String redirectUri;
}
