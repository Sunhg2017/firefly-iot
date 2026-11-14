package com.songhg.firefly.iot.common.message;

import com.songhg.firefly.iot.common.enums.PlatformEventType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

/**
 * 平台事件信封，用于「数据流转中心-事件订阅」的跨服务事件投递。
 * 由 firefly-device（设备创建/上下线/OTA 进度）与 firefly-rule（告警触发）生产到 {@code platform.event} topic。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private String eventId;
    private PlatformEventType eventType;
    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
    private Map<String, Object> payload;
    private long timestamp;
}
