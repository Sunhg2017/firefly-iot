package com.songhg.firefly.iot.common.tracing;

import org.apache.kafka.clients.consumer.ConsumerInterceptor;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Header;
import org.slf4j.MDC;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Kafka Consumer 拦截器：从消息 Header 中提取 traceId / spanId 写入 MDC，
 * 使 @KafkaListener 处理方法中的日志自动携带链路信息。
 *
 * <p>注意：Kafka ConsumerInterceptor 的 onConsume 在 poll() 返回时调用，
 * 此时尚未进入业务线程。对于 Spring Kafka 默认的单线程消费模型，
 * MDC 在 onConsume 中设置后，后续 @KafkaListener 方法可直接读取。</p>
 */
public class KafkaTracingConsumerInterceptor implements ConsumerInterceptor<String, String> {

    @Override
    public ConsumerRecords<String, String> onConsume(ConsumerRecords<String, String> records) {
        // 取批次中第一条消息的 traceId 写入 MDC（同一批次通常来自同一个上游请求）
        records.forEach(record -> {
            Header traceHeader = record.headers().lastHeader(KafkaTracingProducerInterceptor.TRACE_ID_HEADER);
            Header spanHeader = record.headers().lastHeader(KafkaTracingProducerInterceptor.SPAN_ID_HEADER);
            if (traceHeader != null) {
                MDC.put("traceId", new String(traceHeader.value(), StandardCharsets.UTF_8));
            }
            if (spanHeader != null) {
                MDC.put("spanId", new String(spanHeader.value(), StandardCharsets.UTF_8));
            }
        });
        return records;
    }

    @Override
    public void onCommit(Map<TopicPartition, OffsetAndMetadata> offsets) {
        // 提交完成后清理 MDC，避免线程复用导致脏数据
        MDC.remove("traceId");
        MDC.remove("spanId");
    }

    @Override
    public void close() {
        // no-op
    }

    @Override
    public void configure(Map<String, ?> configs) {
        // no-op
    }
}
