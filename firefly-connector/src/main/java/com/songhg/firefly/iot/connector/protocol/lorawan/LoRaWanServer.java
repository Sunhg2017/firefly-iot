package com.songhg.firefly.iot.connector.protocol.lorawan;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.LoRaWanProperties;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
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
    private final Map<String, List<DownlinkRecord>> downlinkRecords = new ConcurrentHashMap<>();

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

    /**
     * The current LoRaWAN connector queues downlink commands locally so the
     * simulator and operators can verify what the platform attempted to send.
     */
    public boolean queueDownlink(String devEui,
                                 Integer fPort,
                                 String data,
                                 Boolean confirmed,
                                 String displayPayload,
                                 DeviceMessage message) {
        LoRaWanDeviceInfo info = getDevice(devEui);
        if (info == null) {
            return false;
        }

        DownlinkRecord record = new DownlinkRecord();
        record.setMessageId(message == null ? null : message.getMessageId());
        record.setDeviceId(message == null ? null : message.getDeviceId());
        record.setDeviceName(message == null ? null : message.getDeviceName());
        record.setMessageType(message == null || message.getType() == null ? null : message.getType().name());
        record.setDevEui(devEui);
        record.setFPort(fPort != null && fPort > 0 ? fPort : properties.getDownlinkFPort());
        record.setConfirmed(confirmed != null ? confirmed : properties.isDownlinkConfirmed());
        record.setData(data);
        record.setDisplayPayload(displayPayload);
        record.setQueuedAt(System.currentTimeMillis());

        List<DownlinkRecord> history = downlinkRecords.computeIfAbsent(devEui, key -> Collections.synchronizedList(new ArrayList<>()));
        history.add(record);
        synchronized (history) {
            while (history.size() > 200) {
                history.remove(0);
            }
        }

        info.getDownlinkCount().incrementAndGet();
        info.setLastDownlinkTime(record.getQueuedAt());
        log.info("LoRaWAN downlink queued: devEui={}, fPort={}, confirmed={}, deviceId={}",
                devEui, record.getFPort(), record.isConfirmed(), record.getDeviceId());
        return true;
    }

    public List<DownlinkRecord> listDownlinks(String devEui, Long sinceTs) {
        List<DownlinkRecord> history = downlinkRecords.get(devEui);
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        long cursor = sinceTs == null ? 0L : sinceTs;
        synchronized (history) {
            return history.stream()
                    .filter(record -> record.getQueuedAt() > cursor)
                    .map(record -> {
                        DownlinkRecord copy = new DownlinkRecord();
                        copy.setMessageId(record.getMessageId());
                        copy.setDeviceId(record.getDeviceId());
                        copy.setDeviceName(record.getDeviceName());
                        copy.setMessageType(record.getMessageType());
                        copy.setDevEui(record.getDevEui());
                        copy.setFPort(record.getFPort());
                        copy.setConfirmed(record.isConfirmed());
                        copy.setData(record.getData());
                        copy.setDisplayPayload(record.getDisplayPayload());
                        copy.setQueuedAt(record.getQueuedAt());
                        return copy;
                    })
                    .toList();
        }
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

    @lombok.Data
    public static class DownlinkRecord {
        private String messageId;
        private Long deviceId;
        private String deviceName;
        private String messageType;
        private String devEui;
        private int fPort;
        private boolean confirmed;
        private String data;
        private String displayPayload;
        private long queuedAt;
    }
}
