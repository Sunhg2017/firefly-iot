package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 用户状态枚举。
 */
@Getter
@AllArgsConstructor
public enum UserStatus implements IEnum<String> {

    ACTIVE("ACTIVE", "正常"),
    DISABLED("DISABLED", "已禁用"),
    LOCKED("LOCKED", "已锁定");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
