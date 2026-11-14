package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 远程配置状态。
 */
@Getter
@AllArgsConstructor
public enum RemoteConfigStatus implements IEnum<String> {

    DRAFT("DRAFT"),
    PUBLISHED("PUBLISHED"),
    DISABLED("DISABLED");

    @EnumValue
    @JsonValue
    private final String value;
}
