package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.connector.protocol.MqttProtocolAdapter;
import io.moquette.broker.security.IAuthorizatorPolicy;
import io.moquette.broker.subscriptions.Topic;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EmbeddedMqttAuthorizator implements IAuthorizatorPolicy {

    private final MqttProtocolAdapter mqttProtocolAdapter;

    @Override
    public boolean canWrite(Topic topic, String user, String client) {
        return mqttProtocolAdapter.isOwnTopic(client, user, topic == null ? null : topic.toString());
    }

    @Override
    public boolean canRead(Topic topic, String user, String client) {
        return mqttProtocolAdapter.isOwnTopic(client, user, topic == null ? null : topic.toString());
    }
}
