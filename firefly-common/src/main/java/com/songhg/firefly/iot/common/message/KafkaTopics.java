package com.songhg.firefly.iot.common.message;

public final class KafkaTopics {

    private KafkaTopics() {}

    public static final String DEVICE_MESSAGE_UP = "device.message.up";
    public static final String DEVICE_MESSAGE_DOWN = "device.message.down";
    public static final String DEVICE_PROPERTY_REPORT = "device.property.report";
    public static final String DEVICE_EVENT_REPORT = "device.event.report";
    public static final String DEVICE_LIFECYCLE = "device.lifecycle";
    public static final String DEVICE_SERVICE_INVOKE = "device.service.invoke";
    public static final String DEVICE_OTA_PROGRESS = "device.ota.progress";
    public static final String RULE_ENGINE_INPUT = "rule.engine.input";
    public static final String ALARM_TRIGGER = "alarm.trigger";
    public static final String SHARE_DATA_FORWARD = "share.data.forward";
}
