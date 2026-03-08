package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.apache.kafka.clients.producer.ProducerInterceptor;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.slf4j.MDC;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Kafka Producer 拦截器：将当前线程的 traceId / spanId 注入到消息 Header 中，
 * 下游 Consumer 读取后即可还原完整链路。
 *
 * <p>由于 Kafka ProducerInterceptor 由 Kafka 自身实例化（非 Spring 管理），
 * 此类通过静态字段持有 Tracer 引用，由 {@link KafkaTracingConfig} 在启动时注入。</p>
 */
public class KafkaTracingProducerInterceptor implements ProducerInterceptor<String, String> {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String SPAN_ID_HEADER = "X-Span-Id";

    private static volatile Tracer tracer;

    public static void setTracer(Tracer t) {
        tracer = t;
    }

    @Override
    public ProducerRecord<String, String> onSend(ProducerRecord<String, String> record) {
        String traceId = null;
        String spanId = null;

        // 优先从 Tracer 获取
        if (tracer != null) {
            Span currentSpan = tracer.currentSpan();
            if (currentSpan != null) {
                traceId = currentSpan.context().traceId();
                spanId = currentSpan.context().spanId();
            }
        }
        // 兜底从 MDC 获取（异步线程已由 TaskDecorator 注入）
        if (traceId == null) {
            traceId = MDC.get("traceId");
            spanId = MDC.get("spanId");
        }

        if (traceId != null) {
            record.headers().add(TRACE_ID_HEADER, traceId.getBytes(StandardCharsets.UTF_8));
        }
        if (spanId != null) {
            record.headers().add(SPAN_ID_HEADER, spanId.getBytes(StandardCharsets.UTF_8));
        }
        return record;
    }

    @Override
    public void onAcknowledgement(RecordMetadata metadata, Exception exception) {
        // no-op
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
