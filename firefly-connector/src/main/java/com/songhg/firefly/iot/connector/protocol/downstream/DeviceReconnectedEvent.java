package com.songhg.firefly.iot.connector.protocol.downstream;

import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;

/**
 * 设备重新建立连接事件：用于触发离线期间积压下行消息的补发。
 */
public record DeviceReconnectedEvent(Long deviceId, MqttSessionRoute route) {
}
