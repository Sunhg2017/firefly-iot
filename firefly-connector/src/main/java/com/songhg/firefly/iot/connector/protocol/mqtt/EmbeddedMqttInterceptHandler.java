package com.songhg.firefly.iot.connector.protocol.mqtt;

import io.moquette.interception.AbstractInterceptHandler;
import io.moquette.interception.messages.InterceptConnectMessage;
import io.moquette.interception.messages.InterceptConnectionLostMessage;
import io.moquette.interception.messages.InterceptDisconnectMessage;
import io.moquette.interception.messages.InterceptPublishMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EmbeddedMqttInterceptHandler extends AbstractInterceptHandler {

    private static final Class<?>[] INTERCEPTED_TYPES = {
            InterceptConnectMessage.class,
            InterceptDisconnectMessage.class,
            InterceptConnectionLostMessage.class,
            InterceptPublishMessage.class
    };

    private final EmbeddedMqttConnectionManager connectionManager;

    @Override
    public String getID() {
        return "firefly-embedded-mqtt";
    }

    @Override
    public Class<?>[] getInterceptedMessageTypes() {
        return INTERCEPTED_TYPES;
    }

    @Override
    public void onConnect(InterceptConnectMessage msg) {
        connectionManager.handleConnected(msg);
    }

    @Override
    public void onDisconnect(InterceptDisconnectMessage msg) {
        connectionManager.handleDisconnected(msg.getClientID(), msg.getUsername(), false);
    }

    @Override
    public void onConnectionLost(InterceptConnectionLostMessage msg) {
        connectionManager.handleDisconnected(msg.getClientID(), msg.getUsername(), true);
    }

    @Override
    public void onPublish(InterceptPublishMessage msg) {
        try {
            connectionManager.handlePublished(msg);
        } finally {
            super.onPublish(msg);
        }
    }

    @Override
    public void onSessionLoopError(Throwable error) {
        log.error("Embedded MQTT session loop error: {}", error.getMessage(), error);
    }
}
