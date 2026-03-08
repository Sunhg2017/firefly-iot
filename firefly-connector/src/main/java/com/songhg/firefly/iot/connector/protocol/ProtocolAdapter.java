package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;

import java.util.Map;

/**
 * 协议适配器接口 — 各协议（MQTT/HTTP/CoAP）实现此接口
 */
public interface ProtocolAdapter {

    /**
     * 协议类型标识
     */
    String getProtocol();

    /**
     * 将协议原始数据解码为统一 DeviceMessage
     */
    DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers);

    /**
     * 将 DeviceMessage 编码为协议下行数据
     */
    byte[] encode(DeviceMessage message);

    /**
     * 是否支持该 topic/路径
     */
    boolean supports(String topic);
}
