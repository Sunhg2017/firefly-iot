package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 角色状态枚举。
 */
@Getter
@AllArgsConstructor
public enum RoleStatus implements IEnum<String> {

    ACTIVE("ACTIVE", "正常"),
    DISABLED("DISABLED", "已禁用");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
