package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Locale;

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

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static PtzCommand fromJson(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return fromValue(number.intValue());
        }
        String text = raw.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return fromValue(Integer.parseInt(text));
        } catch (NumberFormatException ignore) {
            return fromName(text);
        }
    }

    private static PtzCommand fromName(String name) {
        try {
            return PtzCommand.valueOf(name.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unsupported PTZ command: " + name, ex);
        }
    }

    private static PtzCommand fromValue(int value) {
        for (PtzCommand command : values()) {
            if (command.value == value) {
                return command;
            }
        }
        throw new IllegalArgumentException("Unsupported PTZ command value: " + value);
    }
}
