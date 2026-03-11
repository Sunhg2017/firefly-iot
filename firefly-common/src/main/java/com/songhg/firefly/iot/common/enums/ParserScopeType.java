package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析作用域类型枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserScopeType implements IEnum<String> {

    PRODUCT("PRODUCT"),
    TENANT("TENANT");

    @EnumValue
    @JsonValue
    private final String value;
}
