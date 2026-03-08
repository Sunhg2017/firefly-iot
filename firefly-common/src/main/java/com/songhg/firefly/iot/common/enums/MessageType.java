package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备消息类型枚举。
 */
@Getter
@AllArgsConstructor
public enum MessageType implements IEnum<String> {

    PROPERTY_REPORT("PROPERTY_REPORT"),
    EVENT("EVENT"),
    SERVICE_CALL("SERVICE_CALL"),
    SERVICE_REPLY("SERVICE_REPLY");

    @EnumValue
    @JsonValue
    private final String value;
}
