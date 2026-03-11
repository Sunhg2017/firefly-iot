package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析错误处理策略枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserErrorPolicy implements IEnum<String> {

    ERROR("ERROR"),
    DROP("DROP"),
    RAW_DATA("RAW_DATA");

    @EnumValue
    @JsonValue
    private final String value;
}
