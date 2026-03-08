package com.songhg.firefly.iot.connector.protocol.mqtt;

import io.moquette.broker.security.IAuthenticator;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EmbeddedMqttAuthenticator implements IAuthenticator {

    private final EmbeddedMqttConnectionManager connectionManager;

    @Override
    public boolean checkValid(String clientId, String username, byte[] password) {
        return connectionManager.authenticate(clientId, username, password);
    }
}
