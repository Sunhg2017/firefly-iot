package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析定义状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserStatus implements IEnum<String> {

    DRAFT("DRAFT"),
    ENABLED("ENABLED"),
    DISABLED("DISABLED");

    @EnumValue
    @JsonValue
    private final String value;
}
