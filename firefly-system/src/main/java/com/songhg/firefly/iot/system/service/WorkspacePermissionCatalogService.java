package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionGroupVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionOptionVO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuPermissionCatalogVO;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuPermissionCatalog;
import com.songhg.firefly.iot.system.mapper.WorkspaceMenuPermissionCatalogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspacePermissionCatalogService {

    private static final String WORKSPACE_PLATFORM = "PLATFORM";
    private static final String WORKSPACE_TENANT = "TENANT";
    private static final String DASHBOARD_PATH = "/dashboard";

    private final UserDomainService userDomainService;
    private final TenantMenuConfigService tenantMenuConfigService;
    private final WorkspaceMenuPermissionCatalogMapper workspaceMenuPermissionCatalogMapper;

    public List<RolePermissionGroupVO> listAssignablePermissionGroupsForCurrentWorkspace() {
        String workspaceScope = resolveCurrentWorkspaceScope();
        List<WorkspaceMenuPermissionCatalog> rows = WORKSPACE_PLATFORM.equals(workspaceScope)
                ? listCatalogRowsByScope(WORKSPACE_PLATFORM)
                : listTenantAuthorizedCatalogRows(requireTenantId());

        Map<String, RolePermissionGroupVO> groups = new LinkedHashMap<>();
        for (WorkspaceMenuPermissionCatalog row : rows) {
            if (!Boolean.TRUE.equals(row.getRoleCatalogVisible())) {
                continue;
            }

            RolePermissionGroupVO group = groups.computeIfAbsent(row.getModuleKey(), ignored -> {
                RolePermissionGroupVO item = new RolePermissionGroupVO();
                item.setKey(row.getModuleKey());
                item.setLabel(row.getModuleLabel());
                item.setRoutePath(row.getMenuPath());
                item.setPermissions(new ArrayList<>());
                return item;
            });

            RolePermissionOptionVO option = new RolePermissionOptionVO();
            option.setCode(row.getPermissionCode());
            option.setLabel(row.getPermissionLabel());
            group.getPermissions().add(option);
        }

        return new ArrayList<>(groups.values());
    }

    public Set<String> getAssignablePermissionsForCurrentWorkspace() {
        String workspaceScope = resolveCurrentWorkspaceScope();
        return WORKSPACE_PLATFORM.equals(workspaceScope)
                ? getPlatformWorkspacePermissions()
                : getTenantWorkspacePermissions(requireTenantId());
    }

    public Set<String> getTenantWorkspacePermissions(Long tenantId) {
        return extractPermissionCodes(listTenantAuthorizedCatalogRows(tenantId));
    }

    public Set<String> getPlatformWorkspacePermissions() {
        return extractPermissionCodes(listCatalogRowsByScope(WORKSPACE_PLATFORM));
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

    public List<WorkspaceMenuPermissionCatalogVO> listCatalogForSystemOps(String workspaceScope, String keyword) {
        userDomainService.assertCurrentUserIsSystemOps();

        LambdaQueryWrapper<WorkspaceMenuPermissionCatalog> wrapper = new LambdaQueryWrapper<>();
        String normalizedScope = normalizeWorkspaceScope(workspaceScope);
        if (normalizedScope != null) {
            wrapper.eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, normalizedScope);
        }

        String normalizedKeyword = trimToNull(keyword);
        if (normalizedKeyword != null) {
            wrapper.and(query -> query
                    .like(WorkspaceMenuPermissionCatalog::getModuleLabel, normalizedKeyword)
                    .or().like(WorkspaceMenuPermissionCatalog::getMenuPath, normalizedKeyword)
                    .or().like(WorkspaceMenuPermissionCatalog::getPermissionCode, normalizedKeyword)
                    .or().like(WorkspaceMenuPermissionCatalog::getPermissionLabel, normalizedKeyword));
        }

        wrapper.orderByAsc(WorkspaceMenuPermissionCatalog::getWorkspaceScope)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getModuleSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getPermissionSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getId);

        return workspaceMenuPermissionCatalogMapper.selectList(wrapper).stream()
                .map(this::toCatalogVO)
                .toList();
    }

    private List<WorkspaceMenuPermissionCatalog> listTenantAuthorizedCatalogRows(Long tenantId) {
        Set<String> allowedPaths = getTenantAuthorizedMenuPaths(tenantId);
        if (allowedPaths.isEmpty()) {
            return List.of();
        }

        return workspaceMenuPermissionCatalogMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, WORKSPACE_TENANT)
                .in(WorkspaceMenuPermissionCatalog::getMenuPath, allowedPaths)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getModuleSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getPermissionSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getId));
    }

    private List<WorkspaceMenuPermissionCatalog> listCatalogRowsByScope(String workspaceScope) {
        return workspaceMenuPermissionCatalogMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, workspaceScope)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getModuleSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getPermissionSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getId));
    }

    private Set<String> extractPermissionCodes(List<WorkspaceMenuPermissionCatalog> rows) {
        Set<String> permissions = new LinkedHashSet<>();
        for (WorkspaceMenuPermissionCatalog row : rows) {
            if (StringUtils.hasText(row.getPermissionCode())) {
                permissions.add(row.getPermissionCode().trim());
            }
        }
        return permissions;
    }

    private Set<String> getTenantAuthorizedMenuPaths(Long tenantId) {
        Set<String> paths = new LinkedHashSet<>();
        paths.add(DASHBOARD_PATH);

        List<MenuConfigVO> menuConfigs = tenantMenuConfigService.getMenuList(tenantId);
        for (MenuConfigVO item : menuConfigs) {
            if (Boolean.FALSE.equals(item.getVisible())) {
                continue;
            }
            String routePath = trimToNull(item.getRoutePath());
            if (routePath != null) {
                paths.add(routePath);
            }
        }
        return paths;
    }

    private String resolveCurrentWorkspaceScope() {
        return userDomainService.isPlatformTenant(requireTenantId()) ? WORKSPACE_PLATFORM : WORKSPACE_TENANT;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private String normalizeWorkspaceScope(String workspaceScope) {
        String normalized = trimToNull(workspaceScope);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!WORKSPACE_PLATFORM.equals(normalized) && !WORKSPACE_TENANT.equals(normalized)) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid workspace scope: " + workspaceScope);
        }
        return normalized;
    }

    private WorkspaceMenuPermissionCatalogVO toCatalogVO(WorkspaceMenuPermissionCatalog entity) {
        WorkspaceMenuPermissionCatalogVO vo = new WorkspaceMenuPermissionCatalogVO();
        vo.setId(entity.getId());
        vo.setWorkspaceScope(entity.getWorkspaceScope());
        vo.setModuleKey(entity.getModuleKey());
        vo.setModuleLabel(entity.getModuleLabel());
        vo.setMenuPath(entity.getMenuPath());
        vo.setPermissionCode(entity.getPermissionCode());
        vo.setPermissionLabel(entity.getPermissionLabel());
        vo.setModuleSortOrder(entity.getModuleSortOrder());
        vo.setPermissionSortOrder(entity.getPermissionSortOrder());
        vo.setRoleCatalogVisible(entity.getRoleCatalogVisible());
        return vo;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
