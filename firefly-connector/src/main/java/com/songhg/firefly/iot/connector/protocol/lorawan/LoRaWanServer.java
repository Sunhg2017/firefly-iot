package com.songhg.firefly.iot.connector.protocol.lorawan;

import com.songhg.firefly.iot.connector.config.LoRaWanProperties;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * LoRaWAN 服务 — 管理设备信息、接收 webhook 事件、发送下行
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LoRaWanServer {

    private final LoRaWanProperties properties;
    private final LoRaWanProtocolAdapter protocolAdapter;

    /** 已知设备 (devEui -> info) */
    @Getter
    private final Map<String, LoRaWanDeviceInfo> devices = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        if (!properties.isEnabled()) {
            log.info("LoRaWAN integration disabled");
            return;
        }
        log.info("LoRaWAN integration enabled: networkServer={}, webhookPath={}, payloadCodec={}",
                properties.getNetworkServer(), properties.getWebhookPath(), properties.getPayloadCodec());
    }

    // ==================== Webhook Event Handling ====================

    /**
     * 处理上行数据事件 (uplink)
     */
    public void handleUplinkEvent(LoRaWanMessage msg) {
        if (msg.getDevEui() == null || msg.getDevEui().isEmpty()) {
            log.warn("LoRaWAN uplink missing devEui, ignored");
            return;
        }

        // Deduplication
        LoRaWanDeviceInfo info = devices.computeIfAbsent(msg.getDevEui(), k -> {
            LoRaWanDeviceInfo newInfo = new LoRaWanDeviceInfo();
            newInfo.setDevEui(msg.getDevEui());
            newInfo.setFirstSeenTime(System.currentTimeMillis());
            return newInfo;
        });

        long now = System.currentTimeMillis();
        long lastTime = info.getLastDeduplicationTime().get();
        if (now - lastTime < properties.getDeduplicationWindowMs() && msg.getFCnt() <= info.getLastFCnt()) {
            log.debug("LoRaWAN duplicate frame ignored: devEui={}, fCnt={}", msg.getDevEui(), msg.getFCnt());
            return;
        }
        info.getLastDeduplicationTime().set(now);

        // Update device info
        info.setDeviceName(msg.getDeviceName());
        info.setApplicationId(msg.getApplicationId());
        info.setApplicationName(msg.getApplicationName());
        info.setLastUplinkTime(now);
        info.setLastFCnt(msg.getFCnt());
        info.setJoined(true);
        info.getUplinkCount().incrementAndGet();

        if (msg.getRxInfo() != null && msg.getRxInfo().length > 0) {
            LoRaWanMessage.RxInfo best = msg.getRxInfo()[0];
            info.setLastRssi(best.getRssi());
            info.setLastSnr(best.getSnr());
            info.setLastGatewayId(best.getGatewayId());
        }

        // Forward to protocol adapter
        protocolAdapter.handleUplink(msg);
    }

    /**
     * 处理 Join 事件
     */
    public void handleJoinEvent(LoRaWanMessage msg) {
        if (msg.getDevEui() == null) return;

        LoRaWanDeviceInfo info = devices.computeIfAbsent(msg.getDevEui(), k -> {
            LoRaWanDeviceInfo newInfo = new LoRaWanDeviceInfo();
            newInfo.setDevEui(msg.getDevEui());
            newInfo.setFirstSeenTime(System.currentTimeMillis());
            return newInfo;
        });

        info.setDeviceName(msg.getDeviceName());
        info.setApplicationId(msg.getApplicationId());
        info.setApplicationName(msg.getApplicationName());
        info.setJoined(true);

        protocolAdapter.handleJoin(msg);
    }

    /**
     * 处理 ACK 事件
     */
    public void handleAckEvent(LoRaWanMessage msg) {
        log.debug("LoRaWAN ACK received: devEui={}, fCnt={}", msg.getDevEui(), msg.getFCnt());
    }

    /**
     * 处理状态事件 (battery, margin)
     */
    public void handleStatusEvent(LoRaWanMessage msg) {
        log.debug("LoRaWAN status event: devEui={}", msg.getDevEui());
    }

    /**
     * 处理错误事件
     */
    public void handleErrorEvent(LoRaWanMessage msg) {
        log.warn("LoRaWAN error event: devEui={}, data={}", msg.getDevEui(), msg.getData());
    }

    // ==================== Query Methods ====================

    public int getDeviceCount() {
        return devices.size();
    }

    public LoRaWanDeviceInfo getDevice(String devEui) {
        return devices.get(devEui);
    }

    public Collection<LoRaWanDeviceInfo> listDevices() {
        return devices.values();
    }

    public long getTotalUplinks() {
        return devices.values().stream().mapToInt(d -> d.getUplinkCount().get()).sum();
    }

    public long getTotalDownlinks() {
        return devices.values().stream().mapToInt(d -> d.getDownlinkCount().get()).sum();
    }
}
