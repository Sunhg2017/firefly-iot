package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据格式枚举。
 */
@Getter
@AllArgsConstructor
public enum DataFormat implements IEnum<String> {

    JSON("JSON"),
    CUSTOM("CUSTOM");

    @EnumValue
    @JsonValue
    private final String value;
}
