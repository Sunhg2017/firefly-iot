package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * OTA 升级任务状态枚举。
 */
@Getter
@AllArgsConstructor
public enum OtaTaskStatus implements IEnum<String> {

    PENDING("PENDING"),
    IN_PROGRESS("IN_PROGRESS"),
    COMPLETED("COMPLETED"),
    CANCELLED("CANCELLED");

    @EnumValue
    @JsonValue
    private final String value;
}
