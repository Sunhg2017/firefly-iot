package com.songhg.firefly.iot.system.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.StreamSupport;

import static com.songhg.firefly.iot.common.constant.AuthConstants.REDIS_PERM_ROLE;
import static com.songhg.firefly.iot.common.constant.AuthConstants.REDIS_PERM_USER;

/**
 * 权限事件消费者：消费角色权限变更事件，清除受影响用户的权限缓存。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PermissionEventConsumer {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = EventTopics.PERMISSION_EVENTS, groupId = "firefly-system-perm")
    public void onPermissionEvent(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String action = node.path("action").asText();
            Long roleId = node.path("roleId").asLong(0);

            log.info("[权限变更] action={}, roleId={}", action, roleId);

            // 清除角色权限缓存
            if (roleId > 0) {
                redisTemplate.delete(REDIS_PERM_ROLE + roleId);
            }

            // 清除受影响用户的权限缓存
            JsonNode affectedUsers = node.path("affectedUserIds");
            if (affectedUsers.isArray()) {
                List<Long> userIds = StreamSupport.stream(affectedUsers.spliterator(), false)
                        .map(JsonNode::asLong)
                        .toList();
                for (Long userId : userIds) {
                    redisTemplate.delete(REDIS_PERM_USER + userId);
                    log.debug("Evicted permission cache for userId={}", userId);
                }
            }
        } catch (Exception e) {
            log.error("Failed to process permission event: {}", message, e);
        }
    }

    @KafkaListener(topics = EventTopics.ROLE_EVENTS, groupId = "firefly-system-role")
    public void onRoleEvent(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String action = node.path("action").asText();

            if ("ROLE_DELETED".equals(action)) {
                Long roleId = node.path("roleId").asLong(0);
                redisTemplate.delete(REDIS_PERM_ROLE + roleId);

                JsonNode affectedUsers = node.path("affectedUserIds");
                if (affectedUsers.isArray()) {
                    StreamSupport.stream(affectedUsers.spliterator(), false)
                            .map(JsonNode::asLong)
                            .forEach(userId -> redisTemplate.delete(REDIS_PERM_USER + userId));
                }
                log.info("[角色删除] roleId={}, 已清除缓存", roleId);
            }
        } catch (Exception e) {
            log.error("Failed to process role event: {}", message, e);
        }
    }
}
