package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 产品状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ProductStatus implements IEnum<String> {

    DEVELOPMENT("DEVELOPMENT"),
    PUBLISHED("PUBLISHED"),
    DEPRECATED("DEPRECATED");

    @EnumValue
    @JsonValue
    private final String value;
}
