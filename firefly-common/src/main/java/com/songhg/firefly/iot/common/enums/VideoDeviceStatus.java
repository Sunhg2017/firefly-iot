package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 视频设备在线状态枚举。
 */
@Getter
@AllArgsConstructor
public enum VideoDeviceStatus implements IEnum<String> {

    ONLINE("ONLINE"),
    OFFLINE("OFFLINE");

    @EnumValue
    @JsonValue
    private final String value;
}
