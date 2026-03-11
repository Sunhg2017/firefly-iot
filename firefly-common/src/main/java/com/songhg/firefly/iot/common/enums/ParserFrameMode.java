package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析帧模式枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserFrameMode implements IEnum<String> {

    NONE("NONE"),
    DELIMITER("DELIMITER"),
    FIXED_LENGTH("FIXED_LENGTH"),
    LENGTH_FIELD("LENGTH_FIELD");

    @EnumValue
    @JsonValue
    private final String value;
}
