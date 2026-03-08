package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 告警状态枚举。
 */
@Getter
@AllArgsConstructor
public enum AlarmStatus implements IEnum<String> {

    TRIGGERED("TRIGGERED"),
    CONFIRMED("CONFIRMED"),
    PROCESSED("PROCESSED"),
    CLOSED("CLOSED");

    @EnumValue
    @JsonValue
    private final String value;
}
