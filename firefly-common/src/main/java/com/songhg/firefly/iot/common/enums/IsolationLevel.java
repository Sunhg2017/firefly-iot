package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 租户隔离级别枚举。
 */
@Getter
@AllArgsConstructor
public enum IsolationLevel implements IEnum<String> {

    SHARED_RLS("SHARED_RLS", "共享库行级隔离"),
    SCHEMA("SCHEMA", "独立Schema隔离"),
    DATABASE("DATABASE", "独立数据库隔离");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
