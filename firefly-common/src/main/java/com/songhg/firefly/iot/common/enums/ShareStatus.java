package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 跨租户共享状态枚举。
 */
@Getter
@AllArgsConstructor
public enum ShareStatus implements IEnum {

    PENDING("PENDING", "待审批"),
    APPROVED("APPROVED", "已批准"),
    REJECTED("REJECTED", "已驳回"),
    REVOKED("REVOKED", "已撤销"),
    EXPIRED("EXPIRED", "已过期");

    @EnumValue
    @JsonValue
    private final String code;
    private final String desc;

    @Override
    public Object getValue() {
        return this.code;
    }

    @Override
    public String getDescription() {
        return this.desc;
    }
}
