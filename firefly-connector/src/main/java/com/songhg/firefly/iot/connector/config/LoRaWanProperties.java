package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * LoRaWAN integration configuration properties.
 * <p>
 * Binds to {@code firefly.lorawan.*} in application.yml.
 * Controls network server type, API connection, webhook path, payload codec, and downlink defaults.
 * </p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "firefly.lorawan")
public class LoRaWanProperties {

    private boolean enabled = true;

    /** 网络服务器类型: CHIRPSTACK / TTN / CUSTOM */
    private String networkServer = "CHIRPSTACK";

    /** ChirpStack / TTN API 地址 (gRPC 或 REST) */
    private String apiUrl = "http://localhost:8080";

    /** API Token / API Key */
    private String apiToken = "";

    /** Webhook 回调路径前缀 (本地接收上行数据) */
    private String webhookPath = "/api/v1/lorawan/webhook";

    /** 上行数据编码格式: JSON / CAYENNE_LPP / BASE64 */
    private String payloadCodec = "JSON";

    /** 默认应用 ID (ChirpStack) */
    private String applicationId = "";

    /** 下行发送窗口 (CLASS_A / CLASS_C) */
    private String downlinkClass = "CLASS_A";

    /** 下行端口 (fPort) */
    private int downlinkFPort = 1;

    /** 下行确认 (confirmed downlink) */
    private boolean downlinkConfirmed = false;

    /** 去重窗口 (毫秒)，防止网络服务器推送重复帧 */
    private long deduplicationWindowMs = 5000;
}
