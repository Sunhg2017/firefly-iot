package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 视频流会话状态枚举。
 */
@Getter
@AllArgsConstructor
public enum StreamStatus implements IEnum<String> {

    ACTIVE("ACTIVE"),
    CLOSED("CLOSED");

    @EnumValue
    @JsonValue
    private final String value;
}
