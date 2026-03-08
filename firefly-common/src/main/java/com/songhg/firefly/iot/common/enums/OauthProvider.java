package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 第三方 OAuth 登录提供商枚举。
 */
@Getter
@AllArgsConstructor
public enum OauthProvider implements IEnum<String> {

    WECHAT("WECHAT"),
    ALIPAY("ALIPAY"),
    APPLE("APPLE"),
    DINGTALK("DINGTALK");

    @EnumValue
    @JsonValue
    private final String value;
}
