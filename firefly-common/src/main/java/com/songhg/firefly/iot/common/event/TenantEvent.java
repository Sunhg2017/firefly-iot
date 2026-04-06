package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 租户领域事件。
 * 场景: 租户创建、状态变更和删除。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class TenantEvent extends DomainEvent {

    public enum Action { CREATED, UPDATED, STATUS_CHANGED, DELETED }

    private Action action;
    private Long targetTenantId;
    private String tenantCode;
    private String oldStatus;
    private String newStatus;

    public TenantEvent() {
        super();
    }

    public static TenantEvent created(Long tenantId, String tenantCode, Long operatorId) {
        TenantEvent e = new TenantEvent();
        e.setTenantId(tenantId);
        e.setTargetTenantId(tenantId);
        e.setTenantCode(tenantCode);
        e.setOperatorId(operatorId);
        e.setAction(Action.CREATED);
        e.setSource("firefly-system");
        return e;
    }

    public static TenantEvent statusChanged(Long tenantId, String tenantCode,
                                              String oldStatus, String newStatus, Long operatorId) {
        TenantEvent e = new TenantEvent();
        e.setTenantId(tenantId);
        e.setTargetTenantId(tenantId);
        e.setTenantCode(tenantCode);
        e.setOperatorId(operatorId);
        e.setAction(Action.STATUS_CHANGED);
        e.setOldStatus(oldStatus);
        e.setNewStatus(newStatus);
        e.setSource("firefly-system");
        return e;
    }
}
