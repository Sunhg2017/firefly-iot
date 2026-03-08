package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageRouterService {

    private final DeviceShadowService shadowService;
    private final DeviceMessageProducer messageProducer;

    /**
     * 路由上行消息到各处理链
     */
    @SuppressWarnings("unchecked")
    public void routeUpstream(DeviceMessage message) {
        if (message == null || message.getType() == null) {
            log.warn("Invalid device message: null or missing type");
            return;
        }

        log.info("Routing message: type={}, deviceId={}, messageId={}", message.getType(), message.getDeviceId(), message.getMessageId());

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

    /**
     * 属性上报 → 更新设备影子 reported + 转发规则引擎
     */
    private void handlePropertyReport(DeviceMessage message) {
        Map<String, Object> payload = message.getPayload();
        if (payload != null && !payload.isEmpty()) {
            try {
                shadowService.updateReported(message.getDeviceId(), payload);
                log.debug("Shadow reported updated for device {}", message.getDeviceId());
            } catch (Exception e) {
                log.error("Failed to update shadow for device {}: {}", message.getDeviceId(), e.getMessage());
            }
        }
        // 转发到规则引擎 topic
        forwardToRuleEngine(message);
    }

    /**
     * 事件上报 → 转发规则引擎（可触发告警）
     */
    private void handleEventReport(DeviceMessage message) {
        forwardToRuleEngine(message);
    }

    /**
     * 设备上线
     */
    private void handleDeviceOnline(DeviceMessage message) {
        log.info("Device online: deviceId={}", message.getDeviceId());
        // 可在此更新设备在线状态（通过 DeviceService 或直接 Redis）
    }

    /**
     * 设备离线
     */
    private void handleDeviceOffline(DeviceMessage message) {
        log.info("Device offline: deviceId={}", message.getDeviceId());
    }

    /**
     * 服务调用回复
     */
    private void handleServiceReply(DeviceMessage message) {
        log.debug("Service reply received: deviceId={}, messageId={}", message.getDeviceId(), message.getMessageId());
    }

    /**
     * 属性设置回复 → 确认同步，可清除 desired 中已确认的属性
     */
    private void handlePropertySetReply(DeviceMessage message) {
        log.debug("Property set reply: deviceId={}", message.getDeviceId());
    }

    /**
     * OTA 进度上报
     */
    private void handleOtaProgress(DeviceMessage message) {
        log.debug("OTA progress: deviceId={}, payload={}", message.getDeviceId(), message.getPayload());
    }

    /**
     * 转发消息到规则引擎
     */
    private void forwardToRuleEngine(DeviceMessage message) {
        try {
            DeviceMessage ruleMsg = DeviceMessage.builder()
                    .messageId(message.getMessageId())
                    .tenantId(message.getTenantId())
                    .productId(message.getProductId())
                    .deviceId(message.getDeviceId())
                    .deviceName(message.getDeviceName())
                    .type(message.getType())
                    .payload(message.getPayload())
                    .timestamp(message.getTimestamp())
                    .build();
            ruleMsg.setTopic(com.songhg.firefly.iot.common.message.KafkaTopics.RULE_ENGINE_INPUT);
            messageProducer.publishUpstream(ruleMsg);
        } catch (Exception e) {
            log.error("Failed to forward message to rule engine: {}", e.getMessage());
        }
    }
}
