package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 产品类别枚举。
 */
@Getter
@AllArgsConstructor
public enum ProductCategory implements IEnum<String> {

    SENSOR("SENSOR"),
    GATEWAY("GATEWAY"),
    CONTROLLER("CONTROLLER"),
    CAMERA("CAMERA"),
    OTHER("OTHER");

    @EnumValue
    @JsonValue
    private final String value;
}
