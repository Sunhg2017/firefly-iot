package com.songhg.firefly.iot.rule.dataforward.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MQTT 桥接执行器：把设备数据转发到第三方 MQTT Broker。
 * 连接按「租户 + Broker + 客户端前缀 + 用户名 + 凭据摘要」缓存，
 * 避免不同租户或不同凭据复用同一条已认证连接。
 */
@Slf4j
@Component
public class MqttForwardExecutor implements DataForwardTargetExecutor {

    private static final int CONNECT_TIMEOUT_SECONDS = 10;

    private final ObjectMapper objectMapper;
    private final ForwardTemplateRenderer renderer;
    private final Map<String, MqttAsyncClient> clientCache = new ConcurrentHashMap<>();

    public MqttForwardExecutor(ObjectMapper objectMapper, ForwardTemplateRenderer renderer) {
        this.objectMapper = objectMapper;
        this.renderer = renderer;
    }

    @Override
    public DataForwardTargetType type() {
        return DataForwardTargetType.MQTT;
    }

    @Override
    public void execute(DataForwardRule rule, DeviceMessage message, Map<String, Object> variables) throws Exception {
        JsonNode config = parseConfig(rule.getTargetConfig());
        String broker = renderer.requiredText(config, "broker", variables);
        String topic = renderer.requiredText(config, "topic", variables);
        String clientIdPrefix = renderer.textOrDefault(config, "clientIdPrefix", "firefly-forward", variables);
        String username = renderer.textOrNull(config, "username", variables);
        String password = renderer.textOrNull(config, "password", variables);
        int qos = config.path("qos").asInt(1);
        boolean retained = config.path("retained").asBoolean(false);

        byte[] payload = buildPayload(config, variables);
        String key = cacheKey(rule.getTenantId(), broker, clientIdPrefix, username, password);

        MqttAsyncClient client = getOrCreateClient(key, rule.getTenantId(), broker, clientIdPrefix, username, password);
        MqttMessage mqttMessage = new MqttMessage(payload);
        mqttMessage.setQos(qos);
        mqttMessage.setRetained(retained);
        try {
            client.publish(topic, mqttMessage)
                    .waitForCompletion(CONNECT_TIMEOUT_SECONDS * 1000L);
        } catch (Exception ex) {
            // 连接可能已失效，移除并关闭缓存后由下次重建。
            closeQuietly(clientCache.remove(key));
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

    private MqttAsyncClient getOrCreateClient(String key, Long tenantId, String broker, String clientIdPrefix,
                                              String username, String password) throws Exception {
        MqttAsyncClient client = clientCache.get(key);
        if (client != null && client.isConnected()) {
            return client;
        }
        if (client != null) {
            clientCache.remove(key);
            closeQuietly(client);
        }

        MqttAsyncClient created = createAndConnect(broker, clientIdPrefix, username, password);
        MqttAsyncClient existing = clientCache.putIfAbsent(key, created);
        if (existing != null) {
            // 并发创建落败的连接必须关闭，避免连接泄漏。
            closeQuietly(created);
            return existing;
        }
        // 凭据轮换后旧连接不应继续占用；同一端点仅保留当前凭据对应的连接。
        closeSupersededClients(key, tenantId, broker, clientIdPrefix, username);
        return created;
    }

    private void closeSupersededClients(String currentKey, Long tenantId, String broker, String clientIdPrefix,
                                        String username) {
        String endpointPrefix = tenantId + "|" + broker + "|" + clientIdPrefix + "|" + (username == null ? "" : username) + "|";
        clientCache.entrySet().removeIf(entry -> {
            if (entry.getKey().startsWith(endpointPrefix) && !entry.getKey().equals(currentKey)) {
                closeQuietly(entry.getValue());
                return true;
            }
            return false;
        });
    }

    private MqttAsyncClient createAndConnect(String broker, String clientIdPrefix, String username, String password)
            throws Exception {
        String clientId = clientIdPrefix + "-" + UUID.randomUUID();
        MqttAsyncClient client = new MqttAsyncClient(broker, clientId, new MemoryPersistence());

        MqttConnectOptions options = new MqttConnectOptions();
        options.setAutomaticReconnect(false);
        options.setCleanSession(true);
        options.setConnectionTimeout(CONNECT_TIMEOUT_SECONDS);
        if (username != null && !username.isEmpty()) {
            options.setUserName(username);
        }
        if (password != null && !password.isEmpty()) {
            options.setPassword(password.toCharArray());
        }

        try {
            client.connect(options).waitForCompletion(CONNECT_TIMEOUT_SECONDS * 1000L);
            return client;
        } catch (Exception ex) {
            closeQuietly(client);
            throw ex;
        }
    }

    private void closeQuietly(MqttAsyncClient client) {
        if (client == null) {
            return;
        }
        try {
            if (client.isConnected()) {
                client.disconnect().waitForCompletion(3000);
            }
        } catch (Exception ignored) {
            // best effort
        }
        try {
            client.close();
        } catch (Exception ignored) {
            // best effort
        }
    }

    private String cacheKey(Long tenantId, String broker, String clientIdPrefix, String username, String password) {
        return tenantId + "|" + broker + "|" + clientIdPrefix + "|"
                + (username == null ? "" : username) + "|" + sha256(password == null ? "" : password);
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
