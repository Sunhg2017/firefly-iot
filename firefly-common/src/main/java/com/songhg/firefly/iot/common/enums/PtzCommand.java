package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * PTZ 云台控制指令枚举。
 */
@Getter
@AllArgsConstructor
public enum PtzCommand implements IEnum<Integer> {

    STOP(0),
    UP(1),
    DOWN(2),
    LEFT(3),
    RIGHT(4),
    ZOOM_IN(5),
    ZOOM_OUT(6);

    @EnumValue
    @JsonValue
    private final Integer value;
}
