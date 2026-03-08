package com.songhg.firefly.iot.connector.protocol.lorawan;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

/**
 * LoRaWAN 上行/下行消息模型 — 兼容 ChirpStack v4 / TTN v3 webhook 格式
 */
@Data
@Schema(description = "上下行消息模型")
public class LoRaWanMessage {

    /** 设备 EUI (hex string, e.g. "0102030405060708") */
    private String devEui;

    /** 设备名称 */
    private String deviceName;

    /** 应用 ID */
    private String applicationId;

    /** 应用名称 */
    private String applicationName;

    /** 帧计数器 (fCnt) */
    private long fCnt;

    /** 帧端口 (fPort) */
    private int fPort;

    /** Base64 编码的原始载荷 */
    private String data;

    /** 解码后的 JSON 对象 (如果网络服务器已解码) */
    private Map<String, Object> object;

    /** 网关接收信息 */
    private RxInfo[] rxInfo;

    /** 发送参数 */
    private TxInfo txInfo;

    /** 事件类型: up / join / ack / txack / status / error */
    private String eventType;

    /** 去重标记 (防止重复处理) */
    private String deduplicationId;

    /** 接收时间戳 (ISO 8601 或 epoch ms) */
    private String time;

    @Data
    @Schema(description = "网关接收信息")
    public static class RxInfo {
        /** Gateway identifier */
        @Schema(description = "网关编号", example = "eui-0102030405060708")
        private String gatewayId;

        /** Received Signal Strength Indicator (dBm) */
        @Schema(description = "接收信号强度", example = "-80")
        private int rssi;

        /** Signal-to-Noise Ratio (dB) */
        @Schema(description = "信噪比", example = "8.5")
        private double snr;

        /** Channel index */
        @Schema(description = "信道索引", example = "0")
        private String channel;

        /** Gateway geographic location (lat, lng, alt) */
        @Schema(description = "网关位置")
        private Map<String, Object> location;
    }

    @Data
    @Schema(description = "发送参数")
    public static class TxInfo {
        /** Transmission frequency in Hz */
        @Schema(description = "频率", example = "868100000")
        private long frequency;

        /** Modulation type: LORA or FSK */
        @Schema(description = "调制类型", example = "LORA")
        private String modulation;

        /** Data rate parameters */
        @Schema(description = "数据速率配置")
        private DataRate dataRate;
    }

    @Data
    @Schema(description = "数据速率参数")
    public static class DataRate {
        /** Modulation type (LORA / FSK) */
        @Schema(description = "调制类型", example = "LORA")
        private String modulation;

        /** Bandwidth in kHz */
        @Schema(description = "带宽", example = "125")
        private int bandwidth;

        /** Spreading factor (SF7-SF12) */
        @Schema(description = "扩频因子", example = "7")
        private int spreadFactor;

        /** Coding rate */
        @Schema(description = "编码率", example = "4/5")
        private String codeRate;
    }
}
