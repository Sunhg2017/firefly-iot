package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 远程配置下发目标类型。
 */
@Getter
@AllArgsConstructor
public enum RemoteConfigTargetType implements IEnum<String> {

    PRODUCT("PRODUCT"),
    GROUP("GROUP"),
    DEVICE("DEVICE");

    @EnumValue
    @JsonValue
    private final String value;
}
