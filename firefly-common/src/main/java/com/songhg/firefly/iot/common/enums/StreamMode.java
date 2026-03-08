package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 视频流接入模式枚举。
 */
@Getter
@AllArgsConstructor
public enum StreamMode implements IEnum<String> {

    GB28181("GB28181"),
    RTSP("RTSP"),
    RTMP("RTMP");

    @EnumValue
    @JsonValue
    private final String value;
}
