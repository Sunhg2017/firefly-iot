package com.songhg.firefly.iot.rule.dataforward.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 事件订阅：把平台事件（设备创建/上下线/告警触发/OTA 进度）通过 Webhook 推送给外部系统。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "event_subscriptions", autoResultMap = true)
public class EventSubscription extends TenantEntity {

    private String name;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String eventTypes;
    private String webhookUrl;
    private String secret;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String headers;
    private ForwardStatus status;
    private Long deliveryCount;
    private Long successCount;
    private Long errorCount;
    private LocalDateTime lastDeliveredAt;
    private Long createdBy;
}
