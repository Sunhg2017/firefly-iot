package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.http")
public class HttpProtocolProperties {

    /**
     * HTTP 设备在多久没有有效请求后判定为离线。
     */
    private long presenceTimeoutSeconds = 300;

    /**
     * HTTP 离线扫描周期，默认取超时值的三分之一。
     */
    private long presenceSweepIntervalSeconds = 0;

    public long getPresenceTimeoutSeconds() {
        return Math.max(30, presenceTimeoutSeconds);
    }

    public long getPresenceSweepIntervalSeconds() {
        long timeout = getPresenceTimeoutSeconds();
        long configured = presenceSweepIntervalSeconds > 0 ? presenceSweepIntervalSeconds : timeout / 3;
        return Math.max(5, Math.min(configured, timeout));
    }
}
