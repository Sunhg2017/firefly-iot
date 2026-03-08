package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备在线状态枚举。
 */
@Getter
@AllArgsConstructor
public enum OnlineStatus implements IEnum<String> {

    ONLINE("ONLINE"),
    OFFLINE("OFFLINE"),
    UNKNOWN("UNKNOWN");

    @EnumValue
    @JsonValue
    private final String value;
}
