package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * API Key 状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ApiKeyStatus implements IEnum<String> {

    ACTIVE("ACTIVE"),
    DISABLED("DISABLED"),
    DELETED("DELETED");

    @EnumValue
    @JsonValue
    private final String value;
}
