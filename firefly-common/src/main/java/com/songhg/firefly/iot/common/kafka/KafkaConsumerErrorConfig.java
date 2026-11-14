package com.songhg.firefly.iot.common.kafka;

import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

/**
 * 全局 Kafka 消费失败处理：所有业务服务的消费者共享同一套「有限重试 + 死信」策略。
 *
 * <p>消费者必须把异常抛回监听容器，由该 ErrorHandler 执行重试；
 * 重试耗尽后投递到 {@code <topic>.dlt}，保证失败可观测、可补偿，而不是静默提交 offset。</p>
 */
@Configuration
public class KafkaConsumerErrorConfig {

    /**
     * 重试间隔（毫秒）。
     */
    @Value("${firefly.kafka.consumer.retry-interval-ms:1000}")
    private long retryIntervalMs;

    /**
     * 重试次数（不含首次消费）。默认 3 次。
     */
    @Value("${firefly.kafka.consumer.retry-max-attempts:3}")
    private long retryMaxAttempts;

    @Bean
    public DefaultErrorHandler kafkaDefaultErrorHandler(KafkaTemplate<String, String> kafkaTemplate) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                kafkaTemplate,
                (record, ex) -> new TopicPartition(record.topic() + ".dlt", record.partition()));
        long retries = Math.max(0, retryMaxAttempts);
        return new DefaultErrorHandler(recoverer, new FixedBackOff(Math.max(100, retryIntervalMs), retries));
    }
}
