package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 设备证书状态。
 */
@Getter
@AllArgsConstructor
public enum CertificateStatus implements IEnum<String> {

    ACTIVE("ACTIVE"),
    REVOKED("REVOKED");

    @EnumValue
    @JsonValue
    private final String value;
}
