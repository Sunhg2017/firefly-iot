package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据流转目标类型枚举。
 */
@Getter
@AllArgsConstructor
public enum DataForwardTargetType implements IEnum<String> {

    MQTT("MQTT"),
    AMQP("AMQP"),
    TSDB("TSDB"),
    WEBHOOK("WEBHOOK");

    @EnumValue
    @JsonValue
    private final String value;
}
