package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 用户领域事件。
 * 场景: 用户创建、更新、状态变更、角色分配变更、密码重置、删除。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class UserEvent extends DomainEvent {

    public enum Action { CREATED, UPDATED, STATUS_CHANGED, ROLES_CHANGED, PASSWORD_RESET, DELETED }

    private Action action;
    private Long targetUserId;
    private String username;
    private String oldStatus;
    private String newStatus;
    private List<Long> roleIds;

    public UserEvent() {
        super();
    }

    public static UserEvent created(Long tenantId, Long userId, String username, Long operatorId) {
        UserEvent e = new UserEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setUsername(username);
        e.setOperatorId(operatorId);
        e.setAction(Action.CREATED);
        e.setSource("firefly-system");
        return e;
    }

    public static UserEvent rolesChanged(Long tenantId, Long userId, List<Long> roleIds, Long operatorId) {
        UserEvent e = new UserEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setRoleIds(roleIds);
        e.setOperatorId(operatorId);
        e.setAction(Action.ROLES_CHANGED);
        e.setSource("firefly-system");
        return e;
    }

    public static UserEvent deleted(Long tenantId, Long userId, String username, Long operatorId) {
        UserEvent e = new UserEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setUsername(username);
        e.setOperatorId(operatorId);
        e.setAction(Action.DELETED);
        e.setSource("firefly-system");
        return e;
    }
}
