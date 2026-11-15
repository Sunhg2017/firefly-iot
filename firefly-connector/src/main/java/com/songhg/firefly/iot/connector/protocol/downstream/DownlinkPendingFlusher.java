package com.songhg.firefly.iot.connector.protocol.downstream;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.metrics.Metrics;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import com.songhg.firefly.iot.connector.protocol.mqtt.EmbeddedMqttBroker;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * 设备重连后补发离线期间积压的下行消息；任一条发送失败则停止并把剩余消息重新入队。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DownlinkPendingFlusher {

    private final DownlinkPendingQueue pendingQueue;
    private final Optional<EmbeddedMqttBroker> embeddedMqttBroker;
    private final DeviceMessageProducer deviceMessageProducer;

    @Value("${firefly.downlink.flush-batch-size:50}")
    private int flushBatchSize;

    @EventListener
    public void onDeviceReconnected(DeviceReconnectedEvent event) {
        if (event == null || event.deviceId() == null || event.route() == null) {
            return;
        }
        EmbeddedMqttBroker broker = embeddedMqttBroker.orElse(null);
        if (broker == null) {
            return;
        }
        MqttSessionRoute route = event.route();
        List<DeviceMessage> messages = pendingQueue.drain(event.deviceId(), Math.max(1, flushBatchSize));
        if (messages.isEmpty()) {
            return;
        }
        int delivered = 0;
        for (int i = 0; i < messages.size(); i++) {
            DeviceMessage message = messages.get(i);
            try {
                if (!broker.publishDownstream(message, route)) {
                    requeueFrom(event.deviceId(), messages, i);
                    log.warn("Stop flushing pending downlink because publish failed: deviceId={}, messageId={}",
                            event.deviceId(), message.getMessageId());
                    break;
                }
                delivered++;
                deviceMessageProducer.publishDownlinkAck(message.getDeviceId(), message.getMessageId());
            } catch (Exception ex) {
                requeueFrom(event.deviceId(), messages, i);
                log.warn("Stop flushing pending downlink because publish error: deviceId={}, error={}",
                        event.deviceId(), ex.getMessage());
                break;
            }
        }
        if (delivered > 0) {
            Metrics.increment("firefly.connector.downlink.flushed", delivered);
            log.info("Flushed pending downlink after reconnect: deviceId={}, delivered={}", event.deviceId(), delivered);
        }
    }

    private void requeueFrom(Long deviceId, List<DeviceMessage> messages, int fromIndex) {
        for (int i = fromIndex; i < messages.size(); i++) {
            pendingQueue.requeue(messages.get(i));
        }
    }
}
