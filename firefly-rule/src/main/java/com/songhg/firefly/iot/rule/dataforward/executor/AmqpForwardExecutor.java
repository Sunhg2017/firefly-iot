package com.songhg.firefly.iot.rule.dataforward.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AMQP(RabbitMQ) 转发执行器：把设备数据投递到外部 RabbitMQ 交换机。
 * 连接按「租户 + host + port + vhost + username + 凭据摘要」缓存，
 * 避免不同租户或不同凭据复用同一条已认证连接；Channel 非线程安全，按次创建并关闭。
 */
@Slf4j
@Component
public class AmqpForwardExecutor implements DataForwardTargetExecutor {

    private final ObjectMapper objectMapper;
    private final ForwardTemplateRenderer renderer;
    private final Map<String, Connection> connectionCache = new ConcurrentHashMap<>();

    public AmqpForwardExecutor(ObjectMapper objectMapper, ForwardTemplateRenderer renderer) {
        this.objectMapper = objectMapper;
        this.renderer = renderer;
    }

    @Override
    public DataForwardTargetType type() {
        return DataForwardTargetType.AMQP;
    }

    @Override
    public void execute(DataForwardRule rule, DeviceMessage message, Map<String, Object> variables) throws Exception {
        JsonNode config = parseConfig(rule.getTargetConfig());
        String host = renderer.requiredText(config, "host", variables);
        int port = config.path("port").asInt(5672);
        String vhost = renderer.textOrDefault(config, "vhost", "/", variables);
        String username = renderer.textOrDefault(config, "username", "guest", variables);
        String password = renderer.textOrDefault(config, "password", "guest", variables);
        String exchange = renderer.requiredText(config, "exchange", variables);
        String exchangeType = renderer.textOrDefault(config, "exchangeType", "topic", variables);
        String routingKey = renderer.requiredText(config, "routingKey", variables);

        byte[] payload = buildPayload(config, variables);
        String key = cacheKey(rule.getTenantId(), host, port, vhost, username, password);

        Connection connection = getOrCreateConnection(key, rule.getTenantId(), host, port, vhost, username, password);
        try (Channel channel = connection.createChannel()) {
            channel.exchangeDeclare(exchange, exchangeType, true);
            channel.basicPublish(exchange, routingKey, null, payload);
        } catch (Exception ex) {
            closeQuietly(connectionCache.remove(key));
            throw ex;
        }
    }

    private byte[] buildPayload(JsonNode config, Map<String, Object> variables) {
        JsonNode template = config.get("payloadTemplate");
        if (template == null || template.isNull()) {
            return renderer.writeJson(variables).getBytes(StandardCharsets.UTF_8);
        }
        Object rendered = renderer.renderJsonValue(template, variables);
        return (rendered instanceof String ? (String) rendered : renderer.writeJson(rendered))
                .getBytes(StandardCharsets.UTF_8);
    }

    private Connection getOrCreateConnection(String key, Long tenantId, String host, int port, String vhost,
                                             String username, String password) throws Exception {
        Connection connection = connectionCache.get(key);
        if (connection != null && connection.isOpen()) {
            return connection;
        }
        if (connection != null) {
            connectionCache.remove(key);
            closeQuietly(connection);
        }

        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(host);
        factory.setPort(port);
        factory.setVirtualHost(vhost);
        factory.setUsername(username);
        factory.setPassword(password);
        Connection created = factory.newConnection();

        Connection existing = connectionCache.putIfAbsent(key, created);
        if (existing != null) {
            // 并发创建落败的连接必须关闭，避免连接泄漏。
            closeQuietly(created);
            return existing;
        }
        // 凭据轮换后旧连接不应继续占用；同一端点仅保留当前凭据对应的连接。
        closeSupersededConnections(key, tenantId, host, port, vhost, username);
        return created;
    }

    private void closeSupersededConnections(String currentKey, Long tenantId, String host, int port, String vhost,
                                            String username) {
        String endpointPrefix = tenantId + "|" + host + "|" + port + "|" + vhost + "|" + username + "|";
        connectionCache.entrySet().removeIf(entry -> {
            if (entry.getKey().startsWith(endpointPrefix) && !entry.getKey().equals(currentKey)) {
                closeQuietly(entry.getValue());
                return true;
            }
            return false;
        });
    }

    private void closeQuietly(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            if (connection.isOpen()) {
                connection.close();
            }
        } catch (Exception ignored) {
            // best effort
        }
    }

    private String cacheKey(Long tenantId, String host, int port, String vhost, String username, String password) {
        return tenantId + "|" + host + "|" + port + "|" + vhost + "|" + username + "|"
                + sha256(password == null ? "" : password);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private JsonNode parseConfig(String raw) throws Exception {
        return objectMapper.readTree(raw == null ? "{}" : raw);
    }
}
