package com.songhg.firefly.iot.connector.config;

import com.songhg.firefly.iot.connector.protocol.mqtt.MqttRedisDownstreamMessageListener;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttRelayConfig {

    private final MqttProperties mqttProperties;
    private final MqttRedisDownstreamMessageListener messageListener;

    @Bean
    public RedisMessageListenerContainer mqttRedisMessageListenerContainer(RedisConnectionFactory connectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(
                messageListener,
                ChannelTopic.of(mqttProperties.getRelayChannel(mqttProperties.getNodeId()))
        );
        return container;
    }
}
