package com.songhg.firefly.iot.rule.dataforward.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.enums.PlatformEventType;
import com.songhg.firefly.iot.common.message.PlatformEvent;
import com.songhg.firefly.iot.rule.dataforward.entity.EventSubscription;
import com.songhg.firefly.iot.rule.dataforward.mapper.EventSubscriptionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 事件订阅运行时：消费平台事件，按订阅过滤后通过带 HMAC 签名的 Webhook 投递。
 */
@Slf4j
@Service
public class EventSubscriptionRuntimeService {

    private final EventSubscriptionMapper subscriptionMapper;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public EventSubscriptionRuntimeService(EventSubscriptionMapper subscriptionMapper,
                                           ObjectMapper objectMapper,
                                           @Qualifier("ruleRuntimeHttpClient") HttpClient httpClient) {
        this.subscriptionMapper = subscriptionMapper;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public void process(PlatformEvent event) {
        if (event == null || event.getTenantId() == null || event.getEventType() == null) {
            return;
        }
        List<EventSubscription> subscriptions = loadEnabledSubscriptions(event.getTenantId());
        if (subscriptions.isEmpty()) {
            return;
        }

        String body = serializeEvent(event);
        for (EventSubscription subscription : subscriptions) {
            LocalDateTime deliveredAt = LocalDateTime.now();
            if (!subscribes(subscription, event.getEventType())) {
                continue;
            }
            try {
                deliver(subscription, event, body);
                subscriptionMapper.recordDeliverySuccess(subscription.getId(), deliveredAt);
            } catch (Exception ex) {
                subscriptionMapper.recordDeliveryFailure(subscription.getId(), deliveredAt);
                log.error("Event subscription delivery failed: subscriptionId={}, eventId={}",
                        subscription.getId(), event.getEventId(), ex);
            }
        }
    }

    private List<EventSubscription> loadEnabledSubscriptions(Long tenantId) {
        return subscriptionMapper.selectList(new LambdaQueryWrapper<EventSubscription>()
                .eq(EventSubscription::getTenantId, tenantId)
                .eq(EventSubscription::getStatus, ForwardStatus.ENABLED)
                .orderByAsc(EventSubscription::getId));
    }

    private boolean subscribes(EventSubscription subscription, PlatformEventType eventType) {
        return deserializeEventTypes(subscription.getEventTypes()).contains(eventType);
    }

    private void deliver(EventSubscription subscription, PlatformEvent event, String body) throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis());

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(subscription.getWebhookUrl()))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("X-Firefly-Event", event.getEventType().getValue())
                .header("X-Firefly-Event-Id", event.getEventId() == null ? "" : event.getEventId())
                .header("X-Firefly-Timestamp", timestamp);

        Map<String, String> headers = deserializeHeaders(subscription.getHeaders());
        headers.forEach(builder::header);

        if (StringUtils.hasText(subscription.getSecret())) {
            builder.header("X-Firefly-Signature", sign(subscription.getSecret(), body));
        }

        builder.POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("Webhook returned HTTP " + response.statusCode());
        }
    }

    private String sign(String secret, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private String serializeEvent(PlatformEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize platform event", ex);
        }
    }

    private Set<PlatformEventType> deserializeEventTypes(String raw) {
        if (!StringUtils.hasText(raw)) {
            return Collections.emptySet();
        }
        try {
            List<String> values = objectMapper.readValue(raw, new TypeReference<>() {
            });
            Set<PlatformEventType> result = new LinkedHashSet<>();
            for (String value : values) {
                try {
                    result.add(PlatformEventType.valueOf(value));
                } catch (IllegalArgumentException ignored) {
                    // 忽略未知事件类型，避免历史脏数据阻断投递。
                }
            }
            return result;
        } catch (Exception ex) {
            return Collections.emptySet();
        }
    }

    private Map<String, String> deserializeHeaders(String raw) {
        if (!StringUtils.hasText(raw)) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<>() {
            });
        } catch (Exception ex) {
            return Collections.emptyMap();
        }
    }
}
