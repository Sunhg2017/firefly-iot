package com.songhg.firefly.iot.device.config;

import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

/**
 * 设备消息消费失败处理：有限重试后投递到 {@code <topic>.dlt} 死信 topic。
 * 配合消费者不再吞异常，保证数据库/下游短暂故障时消息可重试、最终失败可定位与补偿。
 */
@Configuration
public class KafkaConsumerErrorConfig {

    @Bean
    public DefaultErrorHandler kafkaDefaultErrorHandler(KafkaTemplate<String, String> kafkaTemplate) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                kafkaTemplate,
                (record, ex) -> new TopicPartition(record.topic() + ".dlt", record.partition()));
        // 3 次重试（间隔 1 秒），耗尽后进入死信 topic。
        return new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 3L));
    }
}
