package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备认证方式枚举。
 */
@Getter
@AllArgsConstructor
public enum DeviceAuthType implements IEnum<String> {

    DEVICE_SECRET("DEVICE_SECRET"),
    PRODUCT_SECRET("PRODUCT_SECRET"),
    X509("X509"),
    SAS_TOKEN("SAS_TOKEN");

    @EnumValue
    @JsonValue
    private final String value;
}
