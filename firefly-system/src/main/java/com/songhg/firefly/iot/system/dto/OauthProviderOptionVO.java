package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.OauthProvider;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "第三方登录提供商配置视图")
public class OauthProviderOptionVO {

    @Schema(description = "提供商")
    private OauthProvider provider;

    @Schema(description = "展示名称")
    private String displayName;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "是否支持网页登录跳转")
    private Boolean webAuthorizeSupported;

    @Schema(description = "是否支持当前控制台发起绑定")
    private Boolean webBindSupported;

    @Schema(description = "是否支持客户端 API 登录")
    private Boolean apiLoginSupported;

    @Schema(description = "可用说明")
    private String usageHint;
}
