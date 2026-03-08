package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 规则引擎动作类型枚举。
 */
@Getter
@AllArgsConstructor
public enum RuleActionType implements IEnum<String> {

    DB_WRITE("DB_WRITE"),
    KAFKA_FORWARD("KAFKA_FORWARD"),
    WEBHOOK("WEBHOOK"),
    EMAIL("EMAIL"),
    SMS("SMS"),
    DEVICE_COMMAND("DEVICE_COMMAND");

    @EnumValue
    @JsonValue
    private final String value;
}
