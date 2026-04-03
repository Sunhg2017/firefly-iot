package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageRouterService {

    private final DeviceShadowService shadowService;
    private final DeviceDataService deviceDataService;
    private final DeviceService deviceService;
    private final DeviceLocationService deviceLocationService;
    private final DeviceMessageProducer messageProducer;

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
            try {
                deviceDataService.writeTelemetryFromMessage(normalizedMessage);
            } catch (Exception ex) {
                log.error("Failed to persist property report telemetry for device {}: {}",
                        message.getDeviceId(), ex.getMessage());
            }
            try {
                shadowService.updateReported(message.getDeviceId(), payload);
                log.debug("Shadow reported updated for device {}", message.getDeviceId());
            } catch (Exception ex) {
                log.error("Failed to update shadow for property report device {}: {}",
                        message.getDeviceId(), ex.getMessage());
            }
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
        try {
            deviceDataService.writeEventFromMessage(message);
        } catch (Exception ex) {
            log.error("Failed to persist event report for device {}: {}",
                    message.getDeviceId(), ex.getMessage());
        }
        forwardToRuleEngine(message);
    }

    private void handleDeviceOnline(DeviceMessage message) {
        updateConnectionState(message, OnlineStatus.ONLINE);
        persistOperationalEvent(message, "DEVICE_ONLINE", "Device Online", EventLevel.INFO);
        forwardToRuleEngine(message);
        log.info("Device online: deviceId={}", message.getDeviceId());
    }

    private void handleDeviceOffline(DeviceMessage message) {
        updateConnectionState(message, OnlineStatus.OFFLINE);
        persistOperationalEvent(message, "DEVICE_OFFLINE", "Device Offline", EventLevel.WARNING);
        forwardToRuleEngine(message);
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
            try {
                shadowService.applyPropertySetReply(message.getDeviceId(), payload);
            } catch (Exception ex) {
                log.error("Failed to reconcile property set reply for device {}: {}",
                        message.getDeviceId(), ex.getMessage());
            }
        }
        persistOperationalEvent(message, "PROPERTY_SET_REPLY", "Property Set Reply", EventLevel.INFO);
        forwardToRuleEngine(message);
        log.debug("Property set reply: deviceId={}", message.getDeviceId());
    }

    private void handleOtaProgress(DeviceMessage message) {
        persistOperationalEvent(message, "OTA_PROGRESS", "OTA Progress", EventLevel.INFO);
        forwardToRuleEngine(message);
        log.debug("OTA progress: deviceId={}, payload={}", message.getDeviceId(), message.getPayload());
    }

    private void forwardToRuleEngine(DeviceMessage message) {
        try {
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
            messageProducer.publishToTopic(KafkaTopics.RULE_ENGINE_INPUT, ruleMsg);
        } catch (Exception ex) {
            log.error("Failed to forward message to rule engine: {}", ex.getMessage());
        }
    }

    private void updateConnectionState(DeviceMessage message, OnlineStatus onlineStatus) {
        try {
            deviceService.updateRuntimeConnectionState(
                    message.getTenantId(),
                    message.getDeviceId(),
                    onlineStatus,
                    resolveOccurredAt(message)
            );
        } catch (Exception ex) {
            log.error("Failed to update device connection state: deviceId={}, status={}, error={}",
                    message.getDeviceId(), onlineStatus, ex.getMessage());
        }
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
