package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 告警级别枚举。
 */
@Getter
@AllArgsConstructor
public enum AlarmLevel implements IEnum<String> {

    CRITICAL("CRITICAL", "严重"),
    WARNING("WARNING", "警告"),
    INFO("INFO", "信息");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
