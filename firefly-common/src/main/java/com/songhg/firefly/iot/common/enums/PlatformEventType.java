package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 平台事件类型枚举（用于事件订阅对外推送）。
 */
@Getter
@AllArgsConstructor
public enum PlatformEventType implements IEnum<String> {

    DEVICE_CREATED("DEVICE_CREATED"),
    DEVICE_ONLINE("DEVICE_ONLINE"),
    DEVICE_OFFLINE("DEVICE_OFFLINE"),
    ALERT_TRIGGERED("ALERT_TRIGGERED"),
    OTA_PROGRESS("OTA_PROGRESS");

    @EnumValue
    @JsonValue
    private final String value;
}
