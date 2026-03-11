package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析模式枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserMode implements IEnum<String> {

    SCRIPT("SCRIPT"),
    PLUGIN("PLUGIN"),
    BUILTIN("BUILTIN");

    @EnumValue
    @JsonValue
    private final String value;
}
