package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据权限范围类型枚举。
 */
@Getter
@AllArgsConstructor
public enum DataScopeType implements IEnum<String> {

    ALL("ALL", "全部数据"),
    PROJECT("PROJECT", "项目级数据"),
    GROUP("GROUP", "部门级数据"),
    SELF("SELF", "仅本人数据"),
    CUSTOM("CUSTOM", "自定义数据范围");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
