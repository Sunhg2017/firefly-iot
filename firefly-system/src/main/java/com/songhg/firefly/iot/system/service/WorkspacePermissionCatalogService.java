package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.role.RolePermissionGroupVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionOptionVO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuPermissionVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspacePermissionCatalogService {

    private final UserDomainService userDomainService;
    private final TenantMenuConfigService tenantMenuConfigService;
    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;

    public List<RolePermissionGroupVO> listAssignablePermissionGroupsForCurrentWorkspace() {
        String workspaceScope = resolveCurrentWorkspaceScope();
        List<WorkspaceMenuNodeVO> menuTree = WorkspaceMenuCatalogService.WORKSPACE_PLATFORM.equals(workspaceScope)
                ? workspaceMenuCatalogService.buildMenuTree(workspaceScope)
                : workspaceMenuCatalogService.buildMenuTree(
                workspaceScope,
                tenantMenuConfigService.listAuthorizedMenuKeys(requireTenantId()));
        List<RolePermissionGroupVO> result = new ArrayList<>();
        appendRolePermissionGroups(menuTree, result);
        return result;
    }

    public Set<String> getAssignablePermissionsForCurrentWorkspace() {
        String workspaceScope = resolveCurrentWorkspaceScope();
        return WorkspaceMenuCatalogService.WORKSPACE_PLATFORM.equals(workspaceScope)
                ? getPlatformWorkspacePermissions()
                : getTenantWorkspacePermissions(requireTenantId());
    }

    public Set<String> getTenantWorkspacePermissions(Long tenantId) {
        return workspaceMenuCatalogService.listPermissionCodesForMenuKeys(
                WorkspaceMenuCatalogService.WORKSPACE_TENANT,
                tenantMenuConfigService.listAuthorizedMenuKeys(tenantId));
    }

    public Set<String> getPlatformWorkspacePermissions() {
        return workspaceMenuCatalogService.listAllPermissionCodesByScope(WorkspaceMenuCatalogService.WORKSPACE_PLATFORM);
    }

    public void validateAssignablePermissions(Collection<String> requestedPermissions) {
        Set<String> requested = normalizePermissions(requestedPermissions);
        if (requested.isEmpty()) {
            return;
        }

        Set<String> allowed = getAssignablePermissionsForCurrentWorkspace();
        List<String> invalid = requested.stream()
                .filter(permission -> !allowed.contains(permission))
                .toList();
        if (!invalid.isEmpty()) {
            throw new BizException(ResultCode.PERMISSION_DENIED,
                    "存在当前空间不可分配的权限: " + String.join(", ", invalid));
        }
    }

    public Set<String> retainTenantAuthorizedPermissions(Long tenantId, Collection<String> permissions) {
        Set<String> requested = normalizePermissions(permissions);
        if (requested.isEmpty()) {
            return requested;
        }
        requested.retainAll(getTenantWorkspacePermissions(tenantId));
        return requested;
    }

    public Set<String> normalizePermissions(Collection<String> permissions) {
        Set<String> normalized = new LinkedHashSet<>();
        if (permissions == null) {
            return normalized;
        }
        for (String permission : permissions) {
            if (StringUtils.hasText(permission)) {
                normalized.add(permission.trim());
            }
        }
        return normalized;
    }

    private void appendRolePermissionGroups(List<WorkspaceMenuNodeVO> nodes, List<RolePermissionGroupVO> collector) {
        for (WorkspaceMenuNodeVO node : nodes) {
            if (Boolean.TRUE.equals(node.getRoleCatalogVisible())
                    && node.getPermissions() != null
                    && !node.getPermissions().isEmpty()) {
                RolePermissionGroupVO group = new RolePermissionGroupVO();
                group.setKey(node.getMenuKey());
                group.setLabel(node.getLabel());
                group.setRoutePath(node.getRoutePath());
                group.setPermissions(new ArrayList<>());
                for (WorkspaceMenuPermissionVO permission : node.getPermissions()) {
                    RolePermissionOptionVO option = new RolePermissionOptionVO();
                    option.setCode(permission.getPermissionCode());
                    option.setLabel(permission.getPermissionLabel());
                    group.getPermissions().add(option);
                }
                collector.add(group);
            }
            appendRolePermissionGroups(node.getChildren(), collector);
        }
    }

    private String resolveCurrentWorkspaceScope() {
        return userDomainService.isPlatformTenant(requireTenantId())
                ? WorkspaceMenuCatalogService.WORKSPACE_PLATFORM
                : WorkspaceMenuCatalogService.WORKSPACE_TENANT;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }
}
