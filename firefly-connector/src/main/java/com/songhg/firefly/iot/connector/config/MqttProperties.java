package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.mqtt")
public class MqttProperties implements EnvironmentAware {

    private Environment environment;

    private boolean enabled = true;

    private String host = "0.0.0.0";

    private int port = 1883;

    private boolean allowAnonymous = false;

    private boolean persistenceEnabled = false;

    private String dataPath = "data/mqtt";

    private int maxMessageSize = 65536;

    private String nodeId;

    private String downstreamConsumerGroup;

    private long routeTtlSeconds = 120;

    private long routeRefreshIntervalSeconds = 30;

    private long nodeHeartbeatTtlSeconds = 45;

    private long nodeHeartbeatIntervalSeconds = 15;

    private int downstreamQos = 1;

    private String relayChannelPrefix = "connector:mqtt:downstream:";

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    public String getNodeId() {
        if (nodeId == null || nodeId.isBlank()) {
            nodeId = buildDefaultNodeId();
        }
        return nodeId;
    }

    public String getDownstreamConsumerGroup() {
        if (downstreamConsumerGroup == null || downstreamConsumerGroup.isBlank()) {
            String appName = environment != null
                    ? environment.getProperty("spring.application.name", "firefly-connector")
                    : "firefly-connector";
            downstreamConsumerGroup = sanitizeGroupId(appName + "-mqtt-downstream");
        }
        return downstreamConsumerGroup;
    }

    public long getRouteTtlSeconds() {
        return Math.max(30, routeTtlSeconds);
    }

    public long getRouteRefreshIntervalSeconds() {
        long ttl = getRouteTtlSeconds();
        long refresh = routeRefreshIntervalSeconds > 0 ? routeRefreshIntervalSeconds : ttl / 3;
        return Math.min(Math.max(5, refresh), Math.max(5, ttl - 5));
    }

    public int getDownstreamQos() {
        return Math.max(0, Math.min(2, downstreamQos));
    }

    public long getNodeHeartbeatTtlSeconds() {
        return Math.max(15, nodeHeartbeatTtlSeconds);
    }

    public long getNodeHeartbeatIntervalSeconds() {
        long ttl = getNodeHeartbeatTtlSeconds();
        long interval = nodeHeartbeatIntervalSeconds > 0 ? nodeHeartbeatIntervalSeconds : ttl / 3;
        return Math.min(Math.max(5, interval), Math.max(5, ttl - 5));
    }

    public String getRelayChannelPrefix() {
        return relayChannelPrefix == null || relayChannelPrefix.isBlank()
                ? "connector:mqtt:downstream:"
                : relayChannelPrefix;
    }

    public String getRelayChannel(String nodeId) {
        return getRelayChannelPrefix() + nodeId;
    }

    private String buildDefaultNodeId() {
        String hostName = firstNonBlank(
                readEnvironmentValue("POD_NAME"),
                readEnvironmentValue("HOSTNAME"),
                readEnvironmentValue("HOST")
        );
        if (hostName == null || hostName.isBlank()) {
            try {
                hostName = InetAddress.getLocalHost().getHostName();
            } catch (UnknownHostException ex) {
                hostName = "firefly-connector";
            }
        }

        return sanitizeGroupId(hostName + "-mqtt-" + port);
    }

    private String readEnvironmentValue(String key) {
        if (environment == null) {
            return null;
        }
        String value = environment.getProperty(key);
        if (value == null || value.isBlank()) {
            value = System.getenv(key);
        }
        return value;
    }

    private String sanitizeGroupId(String raw) {
        return raw == null ? "firefly-connector" : raw.replaceAll("[^a-zA-Z0-9._-]", "-");
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
