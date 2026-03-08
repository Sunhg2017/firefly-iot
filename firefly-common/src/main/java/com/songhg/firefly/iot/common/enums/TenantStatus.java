package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 租户状态枚举。
 */
@Getter
@AllArgsConstructor
public enum TenantStatus implements IEnum<String> {

    PENDING("PENDING", "待初始化"),
    INITIALIZING("INITIALIZING", "初始化中"),
    ACTIVE("ACTIVE", "正常"),
    SUSPENDED("SUSPENDED", "已停用"),
    MAINTENANCE("MAINTENANCE", "维护中"),
    DEACTIVATING("DEACTIVATING", "注销中"),
    DELETED("DELETED", "已删除");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
