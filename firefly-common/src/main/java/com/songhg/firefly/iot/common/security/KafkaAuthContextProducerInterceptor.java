package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.context.AppContext;
import org.apache.kafka.clients.producer.ProducerInterceptor;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;

import java.util.Map;

/**
 * Kafka Producer 业务上下文拦截器。
 * 将当前线程中的租户、用户与权限上下文写入消息头，供下游逐条恢复到 AppContextHolder。
 */
public class KafkaAuthContextProducerInterceptor implements ProducerInterceptor<String, String> {

    @Override
    public ProducerRecord<String, String> onSend(ProducerRecord<String, String> record) {
        if (record == null) {
            return null;
        }
        AppContext context = KafkaAuthContextSupport.resolveOutboundContext(record.value());
        if (context != null) {
            KafkaAuthContextSupport.writeHeaders(record.headers(), context);
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
