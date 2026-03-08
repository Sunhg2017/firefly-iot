package com.songhg.firefly.iot.common.event;

/**
 * 领域事件发布器 SPI。
 * 默认实现为 KafkaEventPublisher，也可替换为其他消息中间件。
 */
public interface EventPublisher {

    /**
     * 发布事件到指定 Topic。
     * @param topic Kafka topic
     * @param event 领域事件
     */
    void publish(String topic, DomainEvent event);

    /**
     * 发布事件到指定 Topic，使用指定 key 保证分区有序。
     * @param topic Kafka topic
     * @param key   分区键 (如 tenantId)
     * @param event 领域事件
     */
    void publish(String topic, String key, DomainEvent event);
}
