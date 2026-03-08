package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 固件状态枚举。
 */
@Getter
@AllArgsConstructor
public enum FirmwareStatus implements IEnum<String> {

    DRAFT("DRAFT"),
    VERIFIED("VERIFIED"),
    RELEASED("RELEASED");

    @EnumValue
    @JsonValue
    private final String value;
}
