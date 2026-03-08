package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备状态枚举。
 */
@Getter
@AllArgsConstructor
public enum DeviceStatus implements IEnum<String> {

    INACTIVE("INACTIVE"),
    ACTIVE("ACTIVE"),
    DISABLED("DISABLED");

    @EnumValue
    @JsonValue
    private final String value;
}
