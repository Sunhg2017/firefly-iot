package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备节点类型枚举。
 */
@Getter
@AllArgsConstructor
public enum NodeType implements IEnum<String> {

    DEVICE("DEVICE"),
    GATEWAY("GATEWAY");

    @EnumValue
    @JsonValue
    private final String value;
}
