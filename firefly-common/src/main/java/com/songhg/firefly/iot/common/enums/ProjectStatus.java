package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 项目状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ProjectStatus implements IEnum<String> {

    ACTIVE("ACTIVE"),
    ARCHIVED("ARCHIVED");

    @EnumValue
    @JsonValue
    private final String value;
}
