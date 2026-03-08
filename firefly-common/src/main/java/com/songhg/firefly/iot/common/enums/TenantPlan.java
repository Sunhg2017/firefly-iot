package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 租户套餐计划枚举。
 */
@Getter
@AllArgsConstructor
public enum TenantPlan implements IEnum<String> {

    FREE("FREE", "免费版"),
    STANDARD("STANDARD", "标准版"),
    ENTERPRISE("ENTERPRISE", "企业版");

    @EnumValue
    @JsonValue
    private final String value;
    private final String description;
}
