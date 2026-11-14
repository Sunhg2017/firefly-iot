package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据流转中心启用状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ForwardStatus implements IEnum<String> {

    ENABLED("ENABLED"),
    DISABLED("DISABLED");

    @EnumValue
    @JsonValue
    private final String value;
}
