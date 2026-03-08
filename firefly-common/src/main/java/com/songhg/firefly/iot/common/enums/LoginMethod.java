package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 登录方式枚举。
 */
@Getter
@AllArgsConstructor
public enum LoginMethod implements IEnum<String> {

    PASSWORD("PASSWORD"),
    SMS("SMS"),
    WECHAT("WECHAT"),
    WECHAT_MINI("WECHAT_MINI"),
    ALIPAY("ALIPAY"),
    APPLE("APPLE"),
    DINGTALK("DINGTALK"),
    QRCODE("QRCODE");

    @EnumValue
    @JsonValue
    private final String value;
}
