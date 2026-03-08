package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * OTA 升级任务类型枚举。
 */
@Getter
@AllArgsConstructor
public enum OtaTaskType implements IEnum<String> {

    FULL("FULL"),
    GRAY("GRAY");

    @EnumValue
    @JsonValue
    private final String value;
}
