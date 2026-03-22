package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备接入协议类型枚举。
 */
@Getter
@AllArgsConstructor
public enum ProtocolType implements IEnum<String> {

    MQTT("MQTT"),
    COAP("COAP"),
    HTTP("HTTP"),
    LWM2M("LWM2M"),
    GB28181("GB28181"),
    RTSP("RTSP"),
    RTMP("RTMP"),
    CUSTOM("CUSTOM");

    @EnumValue
    @JsonValue
    private final String value;
}
