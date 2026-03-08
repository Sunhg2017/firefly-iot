package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 会话状态枚举。
 */
@Getter
@AllArgsConstructor
public enum SessionStatus implements IEnum<String> {

    ACTIVE("ACTIVE"),
    EXPIRED("EXPIRED"),
    KICKED("KICKED"),
    LOGOUT("LOGOUT");

    @EnumValue
    @JsonValue
    private final String value;
}
