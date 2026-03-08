package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * OTA 设备升级状态枚举。
 */
@Getter
@AllArgsConstructor
public enum OtaDeviceStatus implements IEnum<String> {

    PENDING("PENDING"),
    DOWNLOADING("DOWNLOADING"),
    UPGRADING("UPGRADING"),
    SUCCESS("SUCCESS"),
    FAILURE("FAILURE"),
    CANCELLED("CANCELLED");

    @EnumValue
    @JsonValue
    private final String value;
}
