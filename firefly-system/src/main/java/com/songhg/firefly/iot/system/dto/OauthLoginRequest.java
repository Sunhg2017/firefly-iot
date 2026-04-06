package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "第三方登录请求")
public class OauthLoginRequest {

    @NotNull(message = "平台标识不能为空")
    @Schema(description = "客户端平台")
    private Platform platform;

    @Schema(description = "OAuth 授权 code")
    private String code;

    @Schema(description = "支付宝 authCode")
    private String authCode;

    @Schema(description = "Apple identityToken")
    private String identityToken;

    @Schema(description = "Apple authorizationCode")
    private String authorizationCode;

    @Schema(description = "微信小程序 encryptedData")
    private String encryptedData;

    @Schema(description = "微信小程序 iv")
    private String iv;

    @Schema(description = "授权 state")
    private String state;

    @Schema(description = "设备指纹")
    private String fingerprint;
}
