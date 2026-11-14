package com.songhg.firefly.iot.system.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.system.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.StreamSupport;

import static com.songhg.firefly.iot.common.constant.AuthConstants.REDIS_PERM_ROLE;

/**
 * 权限事件消费者：消费角色权限变更事件，重建受影响用户权限缓存。
 *
 * <p>只删除 Redis 集合会让业务服务在权限缓存未命中时拒绝合法用户，
 * 因此这里在删除后立即从数据库重算并回写 L2，同时清理 L1。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PermissionEventConsumer {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final PermissionService permissionService;

    @KafkaListener(topics = EventTopics.PERMISSION_EVENTS, groupId = "firefly-system-perm")
    public void onPermissionEvent(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String action = node.path("action").asText();
            Long roleId = node.path("roleId").asLong(0);

            log.info("[权限变更] action={}, roleId={}", action, roleId);

            if (roleId > 0) {
                redisTemplate.delete(REDIS_PERM_ROLE + roleId);
            }
            refreshAffectedUsers(node.path("affectedUserIds"));
        } catch (Exception e) {
            log.error("Failed to process permission event: {}", message, e);
            throw new IllegalStateException("Permission event processing failed", e);
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
                boolean refreshed = refreshAffectedUsers(node.path("affectedUserIds"));
                if (!refreshed) {
                    // 事件未携带受影响用户时清空本实例 L1，下一次查询会从数据库重算并回写 L2。
                    permissionService.evictAllL1Cache();
                }
                log.info("[角色删除] roleId={}, 权限缓存已重建", roleId);
            }
        } catch (Exception e) {
            log.error("Failed to process role event: {}", message, e);
            throw new IllegalStateException("Role event processing failed", e);
        }
    }

    private boolean refreshAffectedUsers(JsonNode affectedUsers) {
        if (affectedUsers == null || !affectedUsers.isArray()) {
            return false;
        }
        List<Long> userIds = StreamSupport.stream(affectedUsers.spliterator(), false)
                .map(JsonNode::asLong)
                .filter(userId -> userId != null && userId > 0)
                .toList();
        for (Long userId : userIds) {
            permissionService.refreshUserPermissions(userId);
        }
        return !userIds.isEmpty();
    }
}
