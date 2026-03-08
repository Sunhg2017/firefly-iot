package com.songhg.firefly.iot.common.event;

import lombok.Data;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * 领域事件基类。所有业务事件继承此类。
 * 发布到 Kafka 时序列化为 JSON，topic = eventType 的小写下划线形式。
 */
@Data
public abstract class DomainEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private String eventId;
    private String eventType;
    private Long tenantId;
    private Long operatorId;
    private Instant occurredAt;
    private String source;

    protected DomainEvent() {
        this.eventId = UUID.randomUUID().toString();
        this.eventType = this.getClass().getSimpleName();
        this.occurredAt = Instant.now();
    }

    protected DomainEvent(Long tenantId, Long operatorId, String source) {
        this();
        this.tenantId = tenantId;
        this.operatorId = operatorId;
        this.source = source;
    }
}
