package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.OauthProvider;
import lombok.Data;

/**
 * 统一承接第三方平台回传的账号标识与资料，避免控制器直接处理各平台字段差异。
 */
@Data
public class OauthAuthenticatedProfile {

    private OauthProvider provider;
    private LoginMethod loginMethod;
    private String appId;
    private String openId;
    private String unionId;
    private String email;
    private String phone;
    private String nickname;
    private String avatarUrl;
    private String rawData;
}
