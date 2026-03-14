package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuCatalogUpsertDTO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SystemMenuPermissionService {

    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;
    private final TenantWorkspaceMenuService tenantWorkspaceMenuService;
    private final TenantService tenantService;
    private final UserDomainService userDomainService;

    public List<WorkspaceMenuNodeVO> listTree(String workspaceScope) {
        userDomainService.assertCurrentUserIsSystemOps();
        return workspaceMenuCatalogService.buildMenuTree(workspaceScope);
    }

    @Transactional
    public WorkspaceMenuCatalog createMenu(WorkspaceMenuCatalogUpsertDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        WorkspaceMenuCatalog created = workspaceMenuCatalogService.createMenu(toEntity(dto));
        syncRoles(created.getWorkspaceScope());
        return created;
    }

    @Transactional
    public WorkspaceMenuCatalog updateMenu(String workspaceScope, String menuKey, WorkspaceMenuCatalogUpsertDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        WorkspaceMenuCatalog updated = workspaceMenuCatalogService.updateMenu(workspaceScope, menuKey, toEntity(dto));
        syncRoles(updated.getWorkspaceScope());
        return updated;
    }

    @Transactional
    public void deleteMenu(String workspaceScope, String menuKey) {
        userDomainService.assertCurrentUserIsSystemOps();
        String normalizedScope = workspaceMenuCatalogService.normalizeWorkspaceScope(workspaceScope);
        Set<String> menuKeys = workspaceMenuCatalogService.collectSubtreeMenuKeys(normalizedScope, menuKey);
        workspaceMenuCatalogService.deleteMenu(normalizedScope, menuKey);
        if (WorkspaceMenuCatalogService.WORKSPACE_TENANT.equals(normalizedScope)) {
            tenantWorkspaceMenuService.deleteAuthorizationsByMenuKeys(menuKeys);
        }
        syncRoles(normalizedScope);
    }

    @Transactional
    public List<WorkspaceMenuNodeVO> replaceMenuPermissions(
            String workspaceScope,
            String menuKey,
            Collection<String> permissionCodes
    ) {
        userDomainService.assertCurrentUserIsSystemOps();
        String normalizedScope = workspaceMenuCatalogService.normalizeWorkspaceScope(workspaceScope);
        workspaceMenuCatalogService.replaceMenuPermissions(normalizedScope, menuKey, permissionCodes);
        syncRoles(normalizedScope);
        return workspaceMenuCatalogService.buildMenuTree(normalizedScope);
    }

    private WorkspaceMenuCatalog toEntity(WorkspaceMenuCatalogUpsertDTO dto) {
        WorkspaceMenuCatalog entity = new WorkspaceMenuCatalog();
        entity.setWorkspaceScope(dto.getWorkspaceScope());
        entity.setParentMenuKey(dto.getParentMenuKey());
        entity.setMenuKey(dto.getMenuKey());
        entity.setLabel(dto.getLabel());
        entity.setIcon(dto.getIcon());
        entity.setRoutePath(dto.getRoutePath());
        entity.setSortOrder(dto.getSortOrder());
        entity.setVisible(dto.getVisible());
        entity.setRoleCatalogVisible(dto.getRoleCatalogVisible());
        return entity;
    }

    private void syncRoles(String workspaceScope) {
        if (WorkspaceMenuCatalogService.WORKSPACE_PLATFORM.equals(workspaceScope)) {
            tenantService.syncPlatformRolePermissionsToAuthorizedScope();
            return;
        }
        tenantService.syncAllTenantRolePermissionsToAuthorizedScope();
    }
}
