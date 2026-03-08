package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 客户端平台类型枚举。
 */
@Getter
@AllArgsConstructor
public enum Platform implements IEnum<String> {

    WEB("WEB"),
    APP_IOS("APP_IOS"),
    APP_ANDROID("APP_ANDROID"),
    MINI_WECHAT("MINI_WECHAT"),
    MINI_ALIPAY("MINI_ALIPAY");

    @EnumValue
    @JsonValue
    private final String value;
}
