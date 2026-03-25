package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.listener.RecordInterceptor;

/**
 * Kafka 单条消息上下文恢复拦截器。
 * 逐条消息恢复 AppContextHolder，避免批量 poll 场景把不同租户/用户消息混用同一线程上下文。
 */
public class KafkaAuthContextRecordInterceptor implements RecordInterceptor<String, String> {

    private final ThreadLocal<AppContext> previousContextHolder = new ThreadLocal<>();

    @Override
    public ConsumerRecord<String, String> intercept(ConsumerRecord<String, String> record, Consumer<String, String> consumer) {
        previousContextHolder.set(KafkaAuthContextSupport.copyOf(AppContextHolder.get()));
        AppContext context = record == null ? null : KafkaAuthContextSupport.resolveInboundContext(record.headers(), record.value());
        if (context != null) {
            AppContextHolder.set(context);
        } else {
            AppContextHolder.clear();
        }
        return record;
    }

    @Override
    public void afterRecord(ConsumerRecord<String, String> record, Consumer<String, String> consumer) {
        AppContext previousContext = previousContextHolder.get();
        previousContextHolder.remove();
        if (previousContext != null) {
            AppContextHolder.set(previousContext);
        } else {
            AppContextHolder.clear();
        }
    }
}
