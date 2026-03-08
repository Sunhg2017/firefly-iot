package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 规则引擎状态枚举。
 */
@Getter
@AllArgsConstructor
public enum RuleEngineStatus implements IEnum<String> {

    ENABLED("ENABLED"),
    DISABLED("DISABLED");

    @EnumValue
    @JsonValue
    private final String value;
}
