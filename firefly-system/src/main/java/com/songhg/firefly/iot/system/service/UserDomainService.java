package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.entity.Tenant;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.mapper.TenantMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserDomainService {

    private static final String PLATFORM_TENANT_CODE = "system-ops";

    private final UserMapper userMapper;
    private final TenantMapper tenantMapper;

    public User requireCurrentUser() {
        Long userId = AppContextHolder.getUserId();
        if (userId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
        return user;
    }

    public void assertCurrentUserIsSystemOps() {
        User current = requireCurrentUser();
        if (current.getUserType() != UserType.SYSTEM_OPS) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "system operations user required");
        }
    }

    public void assertCurrentUserIsSystemSuperAdmin() {
        User current = requireCurrentUser();
        if (current.getUserType() != UserType.SYSTEM_OPS || !isPlatformSuperAdmin(current.getId())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "system super admin required");
        }
    }

    public Long getPlatformTenantId() {
        Tenant tenant = tenantMapper.selectOne(
                new LambdaQueryWrapper<Tenant>()
                        .select(Tenant::getId)
                        .eq(Tenant::getCode, PLATFORM_TENANT_CODE)
                        .isNull(Tenant::getDeletedAt)
                        .last("LIMIT 1"));
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND, "platform tenant not found");
        }
        return tenant.getId();
    }

    public boolean isPlatformTenant(Long tenantId) {
        return tenantId != null && tenantId.equals(getPlatformTenantId());
    }

    public boolean isPlatformSuperAdmin(Long userId) {
        if (userId == null) {
            return false;
        }
        Long platformTenantId = getPlatformTenantId();
        Tenant tenant = tenantMapper.selectById(platformTenantId);
        return tenant != null && userId.equals(tenant.getAdminUserId());
    }

    public boolean isTenantSuperAdmin(Long userId, Long tenantId) {
        if (userId == null || tenantId == null || isPlatformTenant(tenantId)) {
            return false;
        }
        Tenant tenant = tenantMapper.selectById(tenantId);
        return tenant != null && tenant.getDeletedAt() == null && userId.equals(tenant.getAdminUserId());
    }

    public boolean isCurrentUserTenantSuperAdmin() {
        User current = requireCurrentUser();
        if (current.getUserType() != UserType.TENANT_USER) {
            return false;
        }
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            tenantId = current.getTenantId();
        }
        return isTenantSuperAdmin(current.getId(), tenantId);
    }

    public void assertCurrentUserIsTenantSuperAdmin() {
        if (!isCurrentUserTenantSuperAdmin()) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "tenant super admin required");
        }
    }

    public boolean isCurrentUserWorkspaceMenuAdmin() {
        User current = requireCurrentUser();
        if (current.getUserType() == UserType.SYSTEM_OPS) {
            return isPlatformSuperAdmin(current.getId());
        }
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            tenantId = current.getTenantId();
        }
        return isTenantSuperAdmin(current.getId(), tenantId);
    }

    public void assertCurrentUserCanManageWorkspaceMenus() {
        if (!isCurrentUserWorkspaceMenuAdmin()) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "workspace menu admin required");
        }
    }
}
