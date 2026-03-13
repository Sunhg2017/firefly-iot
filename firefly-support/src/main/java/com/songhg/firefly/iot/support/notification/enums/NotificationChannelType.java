package com.songhg.firefly.iot.support.notification.enums;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;

import java.util.Arrays;
import java.util.Locale;

public enum NotificationChannelType {

    EMAIL,
    SMS,
    PHONE,
    WEBHOOK,
    DINGTALK,
    WECHAT,
    IN_APP;

    public static NotificationChannelType of(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "notification channel type is required");
        }
        String normalized = rawValue.trim().toUpperCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(item -> item.name().equals(normalized))
                .findFirst()
                .orElseThrow(() -> new BizException(ResultCode.PARAM_ERROR, "unsupported notification channel type: " + rawValue));
    }

    public String code() {
        return name();
    }
}
