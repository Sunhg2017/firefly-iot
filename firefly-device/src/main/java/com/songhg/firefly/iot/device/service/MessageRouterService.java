package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.enums.PlatformEventType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.message.PlatformEvent;
import com.songhg.firefly.iot.common.message.PlatformEventPublisher;
import com.songhg.firefly.iot.common.metrics.Metrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageRouterService {

    private final DeviceShadowService shadowService;
    private final DeviceDataService deviceDataService;
    private final DeviceService deviceService;
    private final DeviceLocationService deviceLocationService;
    private final DeviceMessageProducer messageProducer;
    private final PlatformEventPublisher platformEventPublisher;
    private final com.songhg.firefly.iot.device.mapper.RemoteConfigAssignmentMapper remoteConfigAssignmentMapper;
    private final OtaProgressService otaProgressService;

    @org.springframework.beans.factory.annotation.Value("${firefly.kafka.rule-forward-timeout-ms:5000}")
    private long ruleForwardTimeoutMs;

    /**
     * Routes upstream device messages to the correct persistence and runtime flows.
     */
    public void routeUpstream(DeviceMessage message) {
        if (message == null || message.getType() == null) {
            log.warn("Invalid device message: null or missing type");
            return;
        }

        log.debug("Routing message: type={}, deviceId={}, messageId={}",
                message.getType(), message.getDeviceId(), message.getMessageId());

        switch (message.getType()) {
            case PROPERTY_REPORT -> handlePropertyReport(message);
            case EVENT_REPORT -> handleEventReport(message);
            case DEVICE_ONLINE -> handleDeviceOnline(message);
            case DEVICE_OFFLINE -> handleDeviceOffline(message);
            case SERVICE_REPLY -> handleServiceReply(message);
            case PROPERTY_SET_REPLY -> handlePropertySetReply(message);
            case OTA_PROGRESS -> handleOtaProgress(message);
            default -> log.warn("Unhandled message type: {}", message.getType());
        }
    }

    private void handlePropertyReport(DeviceMessage message) {
        Map<String, Object> payload = normalizePropertyPayload(message.getPayload());
        DeviceMessage normalizedMessage = payload != null && !payload.isEmpty() ? withPayload(message, payload) : message;
        if (payload != null && !payload.isEmpty()) {
            // 遥测与影子属于核心持久化：失败必须抛给消费框架进入重试/死信，不能只记日志后继续。
            deviceDataService.writeTelemetryFromMessage(normalizedMessage);
            shadowService.updateReported(message.getDeviceId(), payload);
            log.debug("Shadow reported updated for device {}", message.getDeviceId());
            // 位置同步属于派生能力，失败不回滚已完成的遥测与影子写入。
            try {
                deviceLocationService.syncLocationFromPropertyReport(normalizedMessage);
            } catch (Exception ex) {
                log.error("Failed to sync device location for property report device {}: {}",
                        message.getDeviceId(), ex.getMessage());
            }
        }
        forwardToRuleEngine(normalizedMessage);
    }

    private void handleEventReport(DeviceMessage message) {
        // 事件落库失败需进入重试流程，避免事件永久缺失。
        deviceDataService.writeEventFromMessage(message);
        forwardToRuleEngine(message);
    }

    private void handleDeviceOnline(DeviceMessage message) {
        updateConnectionState(message, OnlineStatus.ONLINE);
        persistOperationalEvent(message, "DEVICE_ONLINE", "Device Online", EventLevel.INFO);
        forwardToRuleEngine(message);
        publishPlatformEvent(PlatformEventType.DEVICE_ONLINE, message);
        log.info("Device online: deviceId={}", message.getDeviceId());
    }

    private void handleDeviceOffline(DeviceMessage message) {
        updateConnectionState(message, OnlineStatus.OFFLINE);
        persistOperationalEvent(message, "DEVICE_OFFLINE", "Device Offline", EventLevel.WARNING);
        forwardToRuleEngine(message);
        publishPlatformEvent(PlatformEventType.DEVICE_OFFLINE, message);
        log.info("Device offline: deviceId={}", message.getDeviceId());
    }

    private void handleServiceReply(DeviceMessage message) {
        persistOperationalEvent(message, "SERVICE_REPLY", "Service Reply", EventLevel.INFO);
        forwardToRuleEngine(message);
        log.debug("Service reply received: deviceId={}, messageId={}",
                message.getDeviceId(), message.getMessageId());
    }

    /**
     * Property set replies are the acknowledgement point for desired state,
     * so the shadow must converge reported and desired in one step.
     */
    private void handlePropertySetReply(DeviceMessage message) {
        Map<String, Object> payload = message.getPayload();
        if (payload != null && !payload.isEmpty()) {
            // 影子期望/上报值对齐是核心状态，失败需重试。
            shadowService.applyPropertySetReply(message.getDeviceId(), payload);
        }
        // 设备回执后标记最近一条远程配置下发为已确认（best-effort，不影响主链路）。
        try {
            remoteConfigAssignmentMapper.markLatestAcked(message.getTenantId(), message.getDeviceId());
        } catch (Exception ex) {
            log.warn("Failed to mark remote config assignment acked: deviceId={}, error={}",
                    message.getDeviceId(), ex.getMessage());
        }
        persistOperationalEvent(message, "PROPERTY_SET_REPLY", "Property Set Reply", EventLevel.INFO);
        forwardToRuleEngine(message);
        log.debug("Property set reply: deviceId={}", message.getDeviceId());
    }

    private void handleOtaProgress(DeviceMessage message) {
        Metrics.increment("firefly.ota.progress.received");
        // 先回写任务/设备进度（核心状态），失败时由消费框架重试，避免进度静默丢失。
        otaProgressService.handleProgress(message);
        persistOperationalEvent(message, "OTA_PROGRESS", "OTA Progress", EventLevel.INFO);
        forwardToRuleEngine(message);
        publishPlatformEvent(PlatformEventType.OTA_PROGRESS, message);
        log.debug("OTA progress: deviceId={}, payload={}", message.getDeviceId(), message.getPayload());
    }

    private void forwardToRuleEngine(DeviceMessage message) {
        DeviceMessage ruleMsg = DeviceMessage.builder()
                .messageId(message.getMessageId())
                .tenantId(message.getTenantId())
                .productId(message.getProductId())
                .deviceId(message.getDeviceId())
                .deviceName(message.getDeviceName())
                .type(message.getType())
                .topic(message.getTopic())
                .payload(message.getPayload())
                .timestamp(message.getTimestamp())
                .build();
        // 规则入队失败必须让消费失败：等待发送结果并在异常 future 上抛出，
        // 由统一 ErrorHandler 重试/死信，避免“持久化成功但规则消息未投递”被当作整体成功。
        try {
            messageProducer.publishToTopic(KafkaTopics.RULE_ENGINE_INPUT, ruleMsg)
                    .get(ruleForwardTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while forwarding message to rule engine: messageId="
                    + message.getMessageId(), ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to forward message to rule engine: messageId="
                    + message.getMessageId(), ex);
        }
    }

    private void updateConnectionState(DeviceMessage message, OnlineStatus onlineStatus) {
        // 在线状态是设备可用性的核心状态，失败需进入重试流程。
        deviceService.updateRuntimeConnectionState(
                message.getTenantId(),
                message.getDeviceId(),
                onlineStatus,
                resolveOccurredAt(message)
        );
    }

    private void persistOperationalEvent(DeviceMessage message,
                                         String fallbackEventType,
                                         String fallbackEventName,
                                         EventLevel defaultLevel) {
        try {
            deviceDataService.writeOperationalEventFromMessage(message, fallbackEventType, fallbackEventName, defaultLevel);
        } catch (Exception ex) {
            log.error("Failed to persist operational event: deviceId={}, eventType={}, error={}",
                    message.getDeviceId(), fallbackEventType, ex.getMessage());
        }
    }

    /**
     * 发布平台事件到 platform.event（尽力语义），供事件订阅运行时消费。
     */
    private void publishPlatformEvent(PlatformEventType eventType, DeviceMessage message) {
        try {
            platformEventPublisher.publish(PlatformEvent.builder()
                    .eventType(eventType)
                    .tenantId(message.getTenantId())
                    .productId(message.getProductId())
                    .deviceId(message.getDeviceId())
                    .deviceName(message.getDeviceName())
                    .payload(message.getPayload())
                    .timestamp(message.getTimestamp())
                    .build());
        } catch (Exception ex) {
            log.warn("Failed to publish platform event: type={}, deviceId={}", eventType, message.getDeviceId(), ex);
        }
    }

    private LocalDateTime resolveOccurredAt(DeviceMessage message) {
        if (message == null || message.getTimestamp() <= 0) {
            return LocalDateTime.now();
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(message.getTimestamp()), ZoneId.systemDefault());
    }

    /**
     * Property reports can arrive either as a plain property map or wrapped in
     * a generic envelope such as {"params": {...}}. The shadow and telemetry
     * flows must always consume the actual property set.
     */
    private Map<String, Object> normalizePropertyPayload(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return payload;
        }
        Object params = payload.get("params");
        if (params instanceof Map<?, ?> paramsMap) {
            return toStringKeyMap(paramsMap);
        }
        Object properties = payload.get("properties");
        if (properties instanceof Map<?, ?> propertiesMap) {
            return toStringKeyMap(propertiesMap);
        }
        return payload;
    }

    private Map<String, Object> toStringKeyMap(Map<?, ?> source) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (key != null) {
                normalized.put(key.toString(), value);
            }
        });
        return normalized;
    }

    private DeviceMessage withPayload(DeviceMessage message, Map<String, Object> payload) {
        if (message == null || payload == null || payload == message.getPayload()) {
            return message;
        }
        return DeviceMessage.builder()
                .messageId(message.getMessageId())
                .tenantId(message.getTenantId())
                .productId(message.getProductId())
                .deviceId(message.getDeviceId())
                .deviceName(message.getDeviceName())
                .type(message.getType())
                .topic(message.getTopic())
                .payload(payload)
                .timestamp(message.getTimestamp())
                .build();
    }
}
