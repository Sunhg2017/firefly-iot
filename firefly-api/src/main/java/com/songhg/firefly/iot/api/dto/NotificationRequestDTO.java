package com.songhg.firefly.iot.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

/**
 * 跨服务发送通知请求 DTO（供 Feign 调用 firefly-support 通知中心）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationRequestDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 通知渠道 ID */
    private Long channelId;

    /** 模板编码（如 alarm_notify / device_offline） */
    private String templateCode;

    /** 接收方（邮箱/手机号/Webhook URL） */
    private String recipient;

    /** 模板变量 */
    private Map<String, String> variables;

    /** 租户 ID（由调用方传入，support 服务不依赖 TenantContext） */
    private Long tenantId;
}
