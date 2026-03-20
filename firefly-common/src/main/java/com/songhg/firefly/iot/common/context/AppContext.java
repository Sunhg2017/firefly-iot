package com.songhg.firefly.iot.common.context;

import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.TenantPlan;
import lombok.Data;

import java.io.Serializable;
import java.util.Set;

/**
 * 统一应用上下文，合并租户信息和用户信息。
 * <p>
 * 通过单个 ThreadLocal（{@link AppContextHolder}）管理，
 * 避免多 ThreadLocal 导致的上下文碎片化和 tenantId 冗余存储。
 */
@Data
public class AppContext implements Serializable {

    private static final long serialVersionUID = 1L;

    // ==================== 租户信息 ====================
    private Long tenantId;
    private String tenantCode;
    private TenantPlan plan;
    private IsolationLevel isolationLevel;

    // ==================== 用户信息 ====================
    private Long userId;
    private String username;
    private String platform;
    private Long appKeyId;
    private String openApiCode;
    private Set<String> roles;
    private Set<String> permissions;
}
