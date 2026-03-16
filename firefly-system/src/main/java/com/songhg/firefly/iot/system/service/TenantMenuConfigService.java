package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAuthorizationVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class TenantMenuConfigService {

    private final TenantWorkspaceMenuService tenantWorkspaceMenuService;

    public TenantSpaceMenuAuthorizationVO getTenantSpaceAuthorization(Long tenantId) {
        return tenantWorkspaceMenuService.getTenantSpaceAuthorization(tenantId);
    }

    public Set<String> listAuthorizedMenuKeys(Long tenantId) {
        return tenantWorkspaceMenuService.listAuthorizedMenuKeys(tenantId);
    }

    public Set<String> listAuthorizedRoutePaths(Long tenantId) {
        return tenantWorkspaceMenuService.listAuthorizedRoutePaths(tenantId);
    }

    public TenantSpaceMenuAuthorizationVO replaceMenus(Long tenantId, Collection<String> menuKeys) {
        return tenantWorkspaceMenuService.replaceAuthorizedMenus(tenantId, menuKeys);
    }

    public void deleteAuthorizationsByMenuKeys(Collection<String> menuKeys) {
        tenantWorkspaceMenuService.deleteAuthorizationsByMenuKeys(menuKeys);
    }

    public TenantSpaceMenuAuthorizationVO getTenantSpaceAuthorization() {
        return getTenantSpaceAuthorization(requireTenantId());
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }
}
