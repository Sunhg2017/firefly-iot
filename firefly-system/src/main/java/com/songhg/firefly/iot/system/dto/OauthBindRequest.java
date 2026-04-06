package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.OauthProvider;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "第三方账号绑定请求")
public class OauthBindRequest {

    @NotNull(message = "provider 不能为空")
    @Schema(description = "第三方提供商")
    private OauthProvider provider;

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
}
