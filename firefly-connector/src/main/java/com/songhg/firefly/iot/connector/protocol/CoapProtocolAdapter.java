package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * CoAP 协议适配器 — 面向轻量级、低功耗 IoT 设备
 * <p>
 * CoAP URI 规范 (类 REST):
 * <ul>
 *   <li>POST /auth                     — 设备认证</li>
 *   <li>POST /property?token=xxx       — 属性上报</li>
 *   <li>POST /event?token=xxx          — 事件上报</li>
 *   <li>GET  /shadow?token=xxx         — 获取影子 desired</li>
 *   <li>POST /ota/progress?token=xxx   — OTA 进度上报</li>
 * </ul>
 * <p>
 * CoAP 特性:
 * <ul>
 *   <li>使用 UDP 传输, 低开销</li>
 *   <li>支持 CON(确认)/NON(非确认) 消息类型</li>
 *   <li>CBOR / JSON payload</li>
 *   <li>Observe 机制用于下行推送</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CoapProtocolAdapter implements ProtocolAdapter {

    private final DeviceAuthService authService;
    private final DeviceMessageProducer messageProducer;
    private final MessageCodec messageCodec;

    @Override
    public String getProtocol() {
        return "CoAP";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && topic.startsWith("coap://");
    }

    /**
     * CoAP 设备认证
     * payload: {"productKey":"xxx","deviceName":"xxx","deviceSecret":"xxx"}
     */
    @SuppressWarnings("unchecked")
    public DeviceAuthResult authenticate(byte[] payload) {
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, String> body = om.readValue(payload, Map.class);
            String productKey = body.get("productKey");
            String deviceName = body.get("deviceName");
            String deviceSecret = body.get("deviceSecret");
            return authService.authenticate(productKey, deviceName, deviceSecret);
        } catch (Exception e) {
            log.error("CoAP auth parse error: {}", e.getMessage());
            return DeviceAuthResult.fail("PARSE_ERROR");
        }
    }

    /**
     * 处理 CoAP 属性上报
     */
    public void handlePropertyReport(String token, byte[] payload) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            log.warn("CoAP property report: unauthorized token");
            return;
        }
        DeviceMessage message = messageCodec.decodeJson(
                "/coap/thing/property/post", payload,
                auth.getDeviceId(), auth.getTenantId(), auth.getProductId());
        if (message != null) {
            message.setType(DeviceMessage.MessageType.PROPERTY_REPORT);
            messageProducer.publishUpstream(message);
            log.debug("CoAP property report: deviceId={}", auth.getDeviceId());
        }
    }

    /**
     * 处理 CoAP 事件上报
     */
    public void handleEventReport(String token, byte[] payload) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            log.warn("CoAP event report: unauthorized token");
            return;
        }
        DeviceMessage message = messageCodec.decodeJson(
                "/coap/thing/event/post", payload,
                auth.getDeviceId(), auth.getTenantId(), auth.getProductId());
        if (message != null) {
            message.setType(DeviceMessage.MessageType.EVENT_REPORT);
            messageProducer.publishUpstream(message);
            log.debug("CoAP event report: deviceId={}", auth.getDeviceId());
        }
    }

    /**
     * 处理 CoAP OTA 进度上报
     */
    public void handleOtaProgress(String token, byte[] payload) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            log.warn("CoAP OTA progress: unauthorized token");
            return;
        }
        DeviceMessage message = messageCodec.decodeJson(
                "/coap/ota/progress", payload,
                auth.getDeviceId(), auth.getTenantId(), auth.getProductId());
        if (message != null) {
            message.setType(DeviceMessage.MessageType.OTA_PROGRESS);
            messageProducer.publishUpstream(message);
        }
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        String token = headers != null ? headers.get("token") : null;
        if (token == null) {
            log.warn("CoAP decode: missing token");
            return null;
        }
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) return null;

        DeviceMessage message = messageCodec.decodeJson(topic, payload, auth.getDeviceId(), auth.getTenantId(), auth.getProductId());
        if (message != null && topic != null) {
            if (topic.contains("property")) message.setType(DeviceMessage.MessageType.PROPERTY_REPORT);
            else if (topic.contains("event")) message.setType(DeviceMessage.MessageType.EVENT_REPORT);
            else if (topic.contains("ota")) message.setType(DeviceMessage.MessageType.OTA_PROGRESS);
            else message.setType(DeviceMessage.MessageType.RAW_DATA);
        }
        return message;
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        return messageCodec.encodeJson(message);
    }
}
