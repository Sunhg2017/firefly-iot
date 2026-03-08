package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Tracer;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Kafka 链路追踪自动配置：
 * <ul>
 *   <li>Producer 端：注入 {@link KafkaTracingProducerInterceptor}，发送消息时自动携带 traceId</li>
 *   <li>Consumer 端：注入 {@link KafkaTracingConsumerInterceptor}，消费消息时自动还原 traceId 到 MDC</li>
 * </ul>
 *
 * <p>通过 BeanPostProcessor 方式无侵入地增强已有的 ProducerFactory 和 ConsumerFactory。</p>
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
@ConditionalOnClass(KafkaTemplate.class)
@ConditionalOnBean(Tracer.class)
public class KafkaTracingConfig {

    private final Tracer tracer;

    @PostConstruct
    public void init() {
        KafkaTracingProducerInterceptor.setTracer(tracer);
        log.info("[Tracing] Kafka tracing interceptors registered");
    }

    @Bean
    @ConditionalOnBean(ProducerFactory.class)
    public KafkaTracingProducerCustomizer kafkaTracingProducerCustomizer(ProducerFactory<?, ?> producerFactory) {
        return new KafkaTracingProducerCustomizer(producerFactory);
    }

    @Bean
    @ConditionalOnBean(ConsumerFactory.class)
    public KafkaTracingConsumerCustomizer kafkaTracingConsumerCustomizer(ConsumerFactory<?, ?> consumerFactory) {
        return new KafkaTracingConsumerCustomizer(consumerFactory);
    }

    /**
     * 在 ProducerFactory 的配置中追加 Producer 拦截器
     */
    static class KafkaTracingProducerCustomizer {
        @SuppressWarnings("unchecked")
        KafkaTracingProducerCustomizer(ProducerFactory<?, ?> producerFactory) {
            if (producerFactory instanceof DefaultKafkaProducerFactory factory) {
                Map<String, Object> configs = new HashMap<>(factory.getConfigurationProperties());
                String interceptorKey = org.apache.kafka.clients.producer.ProducerConfig.INTERCEPTOR_CLASSES_CONFIG;
                List<String> interceptors = new ArrayList<>();
                Object existing = configs.get(interceptorKey);
                if (existing instanceof List<?> list) {
                    list.forEach(item -> interceptors.add(item.toString()));
                } else if (existing instanceof String str && !str.isBlank()) {
                    interceptors.add(str);
                }
                String className = KafkaTracingProducerInterceptor.class.getName();
                if (!interceptors.contains(className)) {
                    interceptors.add(className);
                }
                configs.put(interceptorKey, interceptors);
                factory.updateConfigs(configs);
                log.info("[Tracing] Producer interceptor registered: {}", className);
            }
        }
    }

    /**
     * 在 ConsumerFactory 的配置中追加 Consumer 拦截器
     */
    static class KafkaTracingConsumerCustomizer {
        @SuppressWarnings("unchecked")
        KafkaTracingConsumerCustomizer(ConsumerFactory<?, ?> consumerFactory) {
            if (consumerFactory instanceof DefaultKafkaConsumerFactory factory) {
                Map<String, Object> configs = new HashMap<>(factory.getConfigurationProperties());
                String interceptorKey = org.apache.kafka.clients.consumer.ConsumerConfig.INTERCEPTOR_CLASSES_CONFIG;
                List<String> interceptors = new ArrayList<>();
                Object existing = configs.get(interceptorKey);
                if (existing instanceof List<?> list) {
                    list.forEach(item -> interceptors.add(item.toString()));
                } else if (existing instanceof String str && !str.isBlank()) {
                    interceptors.add(str);
                }
                String className = KafkaTracingConsumerInterceptor.class.getName();
                if (!interceptors.contains(className)) {
                    interceptors.add(className);
                }
                configs.put(interceptorKey, interceptors);
                factory.updateConfigs(configs);
                log.info("[Tracing] Consumer interceptor registered: {}", className);
            }
        }
    }
}
