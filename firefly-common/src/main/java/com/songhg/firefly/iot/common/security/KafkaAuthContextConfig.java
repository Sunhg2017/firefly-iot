package com.songhg.firefly.iot.common.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.AbstractKafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Kafka 业务上下文传播配置。
 * Producer 负责写入上下文头，Listener 容器负责在每条消息处理前恢复 AppContextHolder。
 */
@Slf4j
@Configuration
@ConditionalOnClass(KafkaTemplate.class)
public class KafkaAuthContextConfig {

    @Bean
    @ConditionalOnBean(ProducerFactory.class)
    public KafkaAuthContextProducerCustomizer kafkaAuthContextProducerCustomizer(ProducerFactory<?, ?> producerFactory) {
        return new KafkaAuthContextProducerCustomizer(producerFactory);
    }

    @Bean
    public KafkaAuthContextRecordInterceptor kafkaAuthContextRecordInterceptor() {
        return new KafkaAuthContextRecordInterceptor();
    }

    @Bean
    public BeanPostProcessor kafkaAuthContextRecordInterceptorPostProcessor(KafkaAuthContextRecordInterceptor interceptor) {
        return new BeanPostProcessor() {
            @Override
            @SuppressWarnings({"rawtypes", "unchecked"})
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof AbstractKafkaListenerContainerFactory factory) {
                    factory.setRecordInterceptor(interceptor);
                    log.info("[KafkaContext] Record interceptor registered on listener factory: {}", beanName);
                }
                return bean;
            }
        };
    }

    static class KafkaAuthContextProducerCustomizer {
        @SuppressWarnings("unchecked")
        KafkaAuthContextProducerCustomizer(ProducerFactory<?, ?> producerFactory) {
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
                String className = KafkaAuthContextProducerInterceptor.class.getName();
                if (!interceptors.contains(className)) {
                    interceptors.add(className);
                }
                configs.put(interceptorKey, interceptors);
                factory.updateConfigs(configs);
                log.info("[KafkaContext] Producer interceptor registered: {}", className);
            }
        }
    }
}
