package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspaceMenuAccessService {

    private final UserDomainService userDomainService;
    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;
    private final TenantWorkspaceMenuService tenantWorkspaceMenuService;

    public Set<String> listCurrentUserAuthorizedMenuPaths() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        if (userDomainService.isPlatformTenant(tenantId)) {
            return workspaceMenuCatalogService.listVisibleRoutePathsByScope(WorkspaceMenuCatalogService.WORKSPACE_PLATFORM);
        }
        return tenantWorkspaceMenuService.listAuthorizedRoutePaths(tenantId);
    }
}
