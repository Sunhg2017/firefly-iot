package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 角色类型枚举。
 */
@Getter
@AllArgsConstructor
public enum RoleType implements IEnum<String> {

    PRESET("PRESET", "预设角色"),
    CUSTOM("CUSTOM", "自定义角色");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
