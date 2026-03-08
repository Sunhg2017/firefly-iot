package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.websocket")
public class WebSocketProperties {

    private boolean enabled = true;

    /** WebSocket 端点路径 */
    private String path = "/ws/device";

    /** 允许的来源，* 表示全部 */
    private String allowedOrigins = "*";

    /** 最大文本消息大小 (bytes) */
    private int maxTextMessageSize = 65536;

    /** 最大二进制消息大小 (bytes) */
    private int maxBinaryMessageSize = 65536;

    /** 空闲超时 (ms)，0 表示不超时 */
    private long idleTimeoutMs = 300000;
}
