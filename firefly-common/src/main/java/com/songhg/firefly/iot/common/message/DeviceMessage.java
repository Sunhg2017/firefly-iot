package com.songhg.firefly.iot.common.message;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeviceMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    private String messageId;
    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
    private MessageType type;
    private String topic;
    private Map<String, Object> payload;
    private long timestamp;

    public enum MessageType {
        PROPERTY_REPORT,
        EVENT_REPORT,
        SERVICE_INVOKE,
        SERVICE_REPLY,
        PROPERTY_SET,
        PROPERTY_SET_REPLY,
        DEVICE_ONLINE,
        DEVICE_OFFLINE,
        OTA_PROGRESS,
        RAW_DATA
    }
}
