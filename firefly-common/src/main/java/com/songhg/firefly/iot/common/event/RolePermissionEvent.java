package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 角色/权限领域事件。
 * 场景: 角色创建、权限变更、角色删除。
 * 消费方: 清除受影响用户的权限缓存 (Caffeine L1 + Redis L2)。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class RolePermissionEvent extends DomainEvent {

    public enum Action { ROLE_CREATED, ROLE_UPDATED, PERMISSIONS_CHANGED, ROLE_DELETED }

    private Action action;
    private Long roleId;
    private String roleCode;
    private List<String> permissions;
    private List<Long> affectedUserIds;

    public RolePermissionEvent() {
        super();
    }

    public static RolePermissionEvent permissionsChanged(Long tenantId, Long roleId, String roleCode,
                                                          List<String> permissions, Long operatorId) {
        RolePermissionEvent e = new RolePermissionEvent();
        e.setTenantId(tenantId);
        e.setRoleId(roleId);
        e.setRoleCode(roleCode);
        e.setPermissions(permissions);
        e.setOperatorId(operatorId);
        e.setAction(Action.PERMISSIONS_CHANGED);
        e.setSource("firefly-system");
        return e;
    }

    public static RolePermissionEvent roleDeleted(Long tenantId, Long roleId, String roleCode,
                                                    List<Long> affectedUserIds, Long operatorId) {
        RolePermissionEvent e = new RolePermissionEvent();
        e.setTenantId(tenantId);
        e.setRoleId(roleId);
        e.setRoleCode(roleCode);
        e.setAffectedUserIds(affectedUserIds);
        e.setOperatorId(operatorId);
        e.setAction(Action.ROLE_DELETED);
        e.setSource("firefly-system");
        return e;
    }
}
