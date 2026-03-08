package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 事件级别枚举。
 */
@Getter
@AllArgsConstructor
public enum EventLevel implements IEnum<String> {

    INFO("INFO"),
    WARNING("WARNING"),
    CRITICAL("CRITICAL");

    @EnumValue
    @JsonValue
    private final String value;
}
