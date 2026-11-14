package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 远程配置下发状态。
 */
@Getter
@AllArgsConstructor
public enum RemoteConfigAssignmentStatus implements IEnum<String> {

    PENDING("PENDING"),
    DELIVERED("DELIVERED"),
    ACKED("ACKED"),
    FAILED("FAILED");

    @EnumValue
    @JsonValue
    private final String value;
}
