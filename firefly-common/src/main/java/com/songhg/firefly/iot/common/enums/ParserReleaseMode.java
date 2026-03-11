package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析发布模式枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserReleaseMode implements IEnum<String> {

    ALL("ALL"),
    DEVICE_LIST("DEVICE_LIST"),
    HASH_PERCENT("HASH_PERCENT");

    @EnumValue
    @JsonValue
    private final String value;
}
