package com.songhg.firefly.iot.device.dto.device;

import lombok.Data;

/**
 * 按租户统计的在线设备数，供 Prometheus 指标使用。
 */
@Data
public class TenantOnlineCount {

    private Long tenantId;

    /**
     * 租户业务编码，缺失时回退为租户 ID 字符串。
     */
    private String tenantCode;

    private Long onlineCount;
}
