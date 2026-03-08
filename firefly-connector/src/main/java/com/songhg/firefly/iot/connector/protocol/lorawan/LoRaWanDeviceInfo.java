package com.songhg.firefly.iot.connector.protocol.lorawan;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * LoRaWAN device runtime information — tracks uplink/downlink stats, RF quality, and join state.
 */
@Data
@Schema(description = "设备运行信息")
public class LoRaWanDeviceInfo {

    @Schema(description = "设备唯一标识", example = "0102030405060708")
    private String devEui;

    @Schema(description = "设备名称", example = "temperature-sensor-01")
    private String deviceName;

    @Schema(description = "所属应用编号", example = "app-001")
    private String applicationId;

    @Schema(description = "应用名称", example = "Firefly Sensors")
    private String applicationName;

    /** 最近一次上行时间 (epoch ms) */
    private long lastUplinkTime;

    /** 最近一次下行时间 (epoch ms) */
    private long lastDownlinkTime;

    /** 最近 RSSI */
    private int lastRssi;

    /** 最近 SNR */
    private double lastSnr;

    /** 最近网关 ID */
    private String lastGatewayId;

    /** 最近帧计数器 */
    private long lastFCnt;

    /** 累计上行帧数 */
    private final AtomicInteger uplinkCount = new AtomicInteger(0);

    /** 累计下行帧数 */
    private final AtomicInteger downlinkCount = new AtomicInteger(0);

    /** 首次发现时间 */
    private long firstSeenTime;

    /** Join 状态 */
    private boolean joined;

    /** 最近接收时间戳 (用于去重) */
    private final AtomicLong lastDeduplicationTime = new AtomicLong(0);
}
