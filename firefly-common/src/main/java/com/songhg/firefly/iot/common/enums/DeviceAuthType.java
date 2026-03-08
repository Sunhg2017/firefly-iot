package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum DeviceAuthType implements IEnum<String> {

    DEVICE_SECRET("DEVICE_SECRET"),
    PRODUCT_SECRET("PRODUCT_SECRET");

    @EnumValue
    @JsonValue
    private final String value;
}
