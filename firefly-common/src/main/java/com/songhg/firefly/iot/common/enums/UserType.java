package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * User domain type.
 */
@Getter
@AllArgsConstructor
public enum UserType implements IEnum<String> {

    SYSTEM_OPS("SYSTEM_OPS", "System operations user"),
    TENANT_USER("TENANT_USER", "Tenant user");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
