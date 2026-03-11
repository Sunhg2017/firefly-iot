package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 协议解析方向枚举。
 */
@Getter
@AllArgsConstructor
public enum ParserDirection implements IEnum<String> {

    UPLINK("UPLINK"),
    DOWNLINK("DOWNLINK");

    @EnumValue
    @JsonValue
    private final String value;
}
