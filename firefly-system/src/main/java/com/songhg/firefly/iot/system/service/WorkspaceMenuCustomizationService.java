package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuCustomizationUpdateDTO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCatalog;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCustomization;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuPermissionCatalog;
import com.songhg.firefly.iot.system.mapper.WorkspaceMenuCustomizationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspaceMenuCustomizationService {

    public static final String REQUIRED_TENANT_MENU_KEY = "menu-customization";

    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;
    private final WorkspaceMenuCustomizationMapper workspaceMenuCustomizationMapper;
    private final UserDomainService userDomainService;
    private final TenantWorkspaceMenuService tenantWorkspaceMenuService;
    private final PermissionService permissionService;

    public List<WorkspaceMenuNodeVO> listCurrentUserMenuTree() {
        Long tenantId = requireTenantId();
        Long userId = requireUserId();
        String workspaceScope = resolveCurrentWorkspaceScope(tenantId);
        Set<String> accessiblePageMenuKeys = resolveAccessiblePageMenuKeys(workspaceScope, tenantId, userId);
        return buildEffectiveTree(workspaceScope, tenantId, collectMenuKeysWithAncestors(workspaceScope, accessiblePageMenuKeys));
    }

    public List<WorkspaceMenuNodeVO> listCurrentWorkspaceConfigTree() {
        Long tenantId = requireTenantId();
        assertCurrentWorkspaceManager(tenantId);
        String workspaceScope = resolveCurrentWorkspaceScope(tenantId);
        return buildEffectiveTree(workspaceScope, tenantId, resolveConfigurableMenuKeys(workspaceScope, tenantId));
    }

    @Transactional
    public List<WorkspaceMenuNodeVO> updateCurrentWorkspaceMenu(String menuKey, WorkspaceMenuCustomizationUpdateDTO dto) {
        Long tenantId = requireTenantId();
        assertCurrentWorkspaceManager(tenantId);
        String workspaceScope = resolveCurrentWorkspaceScope(tenantId);
        String normalizedMenuKey = trimRequired(menuKey, "menu key is required");
        WorkspaceMenuCatalog baseMenu = requireConfigurableMenu(workspaceScope, tenantId, normalizedMenuKey);

        Set<String> configurableMenuKeys = resolveConfigurableMenuKeys(workspaceScope, tenantId);
        Map<String, WorkspaceMenuCatalog> baseMenuByKey = mapMenusByKey(workspaceMenuCatalogService.listMenusByScope(workspaceScope));
        Map<String, String> effectiveParentMapping = buildEffectiveParentMapping(
                baseMenuByKey,
                configurableMenuKeys,
                listCustomizations(tenantId, workspaceScope));

        String nextParentMenuKey = normalizeParentMenuKey(
                dto.getParentMenuKey(),
                normalizedMenuKey,
                baseMenuByKey,
                configurableMenuKeys);
        if (wouldCreateCycle(normalizedMenuKey, nextParentMenuKey, effectiveParentMapping)) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu cannot move under its descendant");
        }

        String nextLabel = trimRequired(dto.getLabel(), "menu label is required");
        Integer nextSortOrder = dto.getSortOrder() == null ? 0 : dto.getSortOrder();
        String baseParentMenuKey = normalizeBaseParentMenuKey(baseMenu, baseMenuByKey, configurableMenuKeys);

        WorkspaceMenuCustomization existing = findCustomization(tenantId, workspaceScope, normalizedMenuKey);
        if (Objects.equals(nextLabel, baseMenu.getLabel())
                && Objects.equals(nextSortOrder, defaultSortOrder(baseMenu.getSortOrder()))
                && Objects.equals(nextParentMenuKey, baseParentMenuKey)) {
            if (existing != null) {
                workspaceMenuCustomizationMapper.deleteById(existing.getId());
            }
            return listCurrentWorkspaceConfigTree();
        }

        WorkspaceMenuCustomization target = existing == null ? new WorkspaceMenuCustomization() : existing;
        target.setTenantId(tenantId);
        target.setWorkspaceScope(workspaceScope);
        target.setMenuKey(normalizedMenuKey);
        target.setParentMenuKey(nextParentMenuKey);
        target.setLabel(nextLabel);
        target.setSortOrder(nextSortOrder);
        target.setUpdatedBy(requireUserId());
        target.setUpdatedAt(LocalDateTime.now());
        if (existing == null) {
            target.setCreatedAt(LocalDateTime.now());
            workspaceMenuCustomizationMapper.insert(target);
        } else {
            workspaceMenuCustomizationMapper.updateById(target);
        }
        return listCurrentWorkspaceConfigTree();
    }

    @Transactional
    public List<WorkspaceMenuNodeVO> resetCurrentWorkspaceMenu(String menuKey) {
        Long tenantId = requireTenantId();
        assertCurrentWorkspaceManager(tenantId);
        String workspaceScope = resolveCurrentWorkspaceScope(tenantId);
        WorkspaceMenuCustomization existing = findCustomization(tenantId, workspaceScope, menuKey);
        if (existing != null) {
            workspaceMenuCustomizationMapper.deleteById(existing.getId());
        }
        return listCurrentWorkspaceConfigTree();
    }

    public Set<String> appendRequiredTenantMenuKeys(Collection<String> menuKeys) {
        Set<String> normalized = workspaceMenuCatalogService.normalizeMenuKeys(menuKeys);
        normalized.add(REQUIRED_TENANT_MENU_KEY);
        return normalized;
    }

    private List<WorkspaceMenuNodeVO> buildEffectiveTree(String workspaceScope, Long tenantId, Set<String> includedMenuKeys) {
        if (includedMenuKeys.isEmpty()) {
            return List.of();
        }

        List<WorkspaceMenuCatalog> baseMenus = workspaceMenuCatalogService.listMenusByScope(workspaceScope);
        Map<String, WorkspaceMenuCatalog> baseMenuByKey = mapMenusByKey(baseMenus);
        List<WorkspaceMenuCustomization> customizations = listCustomizations(tenantId, workspaceScope);
        Map<String, String> effectiveParentMapping = buildEffectiveParentMapping(baseMenuByKey, includedMenuKeys, customizations);
        Map<String, WorkspaceMenuCustomization> customizationByKey = mapCustomizationsByKey(customizations);

        List<WorkspaceMenuCatalog> effectiveMenus = new ArrayList<>();
        for (WorkspaceMenuCatalog baseMenu : baseMenus) {
            if (!includedMenuKeys.contains(baseMenu.getMenuKey())) {
                continue;
            }
            WorkspaceMenuCustomization customization = customizationByKey.get(baseMenu.getMenuKey());
            WorkspaceMenuCatalog effective = new WorkspaceMenuCatalog();
            effective.setId(baseMenu.getId());
            effective.setWorkspaceScope(baseMenu.getWorkspaceScope());
            effective.setMenuKey(baseMenu.getMenuKey());
            effective.setParentMenuKey(effectiveParentMapping.get(baseMenu.getMenuKey()));
            effective.setLabel(customization != null && StringUtils.hasText(customization.getLabel())
                    ? customization.getLabel().trim()
                    : baseMenu.getLabel());
            effective.setIcon(baseMenu.getIcon());
            effective.setRoutePath(baseMenu.getRoutePath());
            effective.setMenuType(baseMenu.getMenuType());
            effective.setSortOrder(customization != null && customization.getSortOrder() != null
                    ? customization.getSortOrder()
                    : baseMenu.getSortOrder());
            effective.setVisible(baseMenu.getVisible());
            effective.setRoleCatalogVisible(baseMenu.getRoleCatalogVisible());
            effective.setCreatedAt(baseMenu.getCreatedAt());
            effective.setUpdatedAt(baseMenu.getUpdatedAt());
            effectiveMenus.add(effective);
        }

        List<WorkspaceMenuPermissionCatalog> permissions = workspaceMenuCatalogService.listPermissionsByScope(workspaceScope);
        return workspaceMenuCatalogService.buildMenuTree(effectiveMenus, permissions, Set.of());
    }

    private Map<String, String> buildEffectiveParentMapping(
            Map<String, WorkspaceMenuCatalog> baseMenuByKey,
            Set<String> includedMenuKeys,
            List<WorkspaceMenuCustomization> customizations
    ) {
        Map<String, String> parentMapping = new LinkedHashMap<>();
        for (String menuKey : includedMenuKeys) {
            WorkspaceMenuCatalog baseMenu = baseMenuByKey.get(menuKey);
            if (baseMenu == null) {
                continue;
            }
            parentMapping.put(menuKey, normalizeBaseParentMenuKey(baseMenu, baseMenuByKey, includedMenuKeys));
        }
        for (WorkspaceMenuCustomization customization : customizations) {
            if (!includedMenuKeys.contains(customization.getMenuKey())) {
                continue;
            }
            String nextParentMenuKey = resolveStoredParentMenuKey(
                    customization.getParentMenuKey(),
                    customization.getMenuKey(),
                    baseMenuByKey,
                    includedMenuKeys);
            if (wouldCreateCycle(customization.getMenuKey(), nextParentMenuKey, parentMapping)) {
                continue;
            }
            parentMapping.put(customization.getMenuKey(), nextParentMenuKey);
        }
        return parentMapping;
    }

    private boolean wouldCreateCycle(String menuKey, String nextParentMenuKey, Map<String, String> parentMapping) {
        String current = nextParentMenuKey;
        Set<String> visited = new LinkedHashSet<>();
        while (current != null) {
            if (!visited.add(current)) {
                return true;
            }
            if (Objects.equals(current, menuKey)) {
                return true;
            }
            current = parentMapping.get(current);
        }
        return false;
    }

    private Set<String> resolveAccessiblePageMenuKeys(String workspaceScope, Long tenantId, Long userId) {
        Set<String> pageMenuKeys = resolveConfigurablePageMenuKeys(workspaceScope, tenantId);
        if (pageMenuKeys.isEmpty()) {
            return Set.of();
        }

        Map<String, List<String>> permissionCodesByMenuKey = new LinkedHashMap<>();
        for (WorkspaceMenuPermissionCatalog permission : workspaceMenuCatalogService.listPermissionsByScope(workspaceScope)) {
            permissionCodesByMenuKey.computeIfAbsent(permission.getMenuKey(), ignored -> new ArrayList<>())
                    .add(permission.getPermissionCode());
        }

        Set<String> accessibleMenuKeys = new LinkedHashSet<>();
        for (String menuKey : pageMenuKeys) {
            List<String> permissionCodes = permissionCodesByMenuKey.getOrDefault(menuKey, List.of());
            if (permissionCodes.isEmpty()) {
                accessibleMenuKeys.add(menuKey);
                continue;
            }
            for (String permissionCode : permissionCodes) {
                if (permissionService.hasPermission(userId, permissionCode)) {
                    accessibleMenuKeys.add(menuKey);
                    break;
                }
            }
        }
        return accessibleMenuKeys;
    }

    private Set<String> resolveConfigurableMenuKeys(String workspaceScope, Long tenantId) {
        return collectMenuKeysWithAncestors(workspaceScope, resolveConfigurablePageMenuKeys(workspaceScope, tenantId));
    }

    private Set<String> resolveConfigurablePageMenuKeys(String workspaceScope, Long tenantId) {
        List<WorkspaceMenuCatalog> menus = workspaceMenuCatalogService.listMenusByScope(workspaceScope);
        Set<String> result = new LinkedHashSet<>();
        Set<String> allowedTenantMenuKeys = WorkspaceMenuCatalogService.WORKSPACE_TENANT.equals(workspaceScope)
                ? appendRequiredTenantMenuKeys(tenantWorkspaceMenuService.listAuthorizedMenuKeys(tenantId))
                : Set.of();

        for (WorkspaceMenuCatalog menu : menus) {
            if (!WorkspaceMenuCatalogService.MENU_TYPE_PAGE.equals(menu.getMenuType())) {
                continue;
            }
            if (!Boolean.TRUE.equals(menu.getVisible())) {
                continue;
            }
            if (WorkspaceMenuCatalogService.WORKSPACE_PLATFORM.equals(workspaceScope) || allowedTenantMenuKeys.contains(menu.getMenuKey())) {
                result.add(menu.getMenuKey());
            }
        }
        return result;
    }

    private Set<String> collectMenuKeysWithAncestors(String workspaceScope, Collection<String> pageMenuKeys) {
        Set<String> menuKeys = new LinkedHashSet<>();
        if (pageMenuKeys == null || pageMenuKeys.isEmpty()) {
            return menuKeys;
        }

        Map<String, WorkspaceMenuCatalog> baseMenuByKey = mapMenusByKey(workspaceMenuCatalogService.listMenusByScope(workspaceScope));
        for (String pageMenuKey : pageMenuKeys) {
            WorkspaceMenuCatalog current = baseMenuByKey.get(pageMenuKey);
            while (current != null) {
                menuKeys.add(current.getMenuKey());
                current = StringUtils.hasText(current.getParentMenuKey())
                        ? baseMenuByKey.get(current.getParentMenuKey().trim())
                        : null;
            }
        }
        return menuKeys;
    }

    private WorkspaceMenuCatalog requireConfigurableMenu(String workspaceScope, Long tenantId, String menuKey) {
        if (!resolveConfigurableMenuKeys(workspaceScope, tenantId).contains(menuKey)) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu is not configurable in current workspace");
        }
        return workspaceMenuCatalogService.requireMenu(workspaceScope, menuKey);
    }

    private List<WorkspaceMenuCustomization> listCustomizations(Long tenantId, String workspaceScope) {
        return workspaceMenuCustomizationMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuCustomization>()
                .eq(WorkspaceMenuCustomization::getTenantId, tenantId)
                .eq(WorkspaceMenuCustomization::getWorkspaceScope, workspaceScope)
                .orderByAsc(WorkspaceMenuCustomization::getUpdatedAt)
                .orderByAsc(WorkspaceMenuCustomization::getId));
    }

    private WorkspaceMenuCustomization findCustomization(Long tenantId, String workspaceScope, String menuKey) {
        return workspaceMenuCustomizationMapper.selectOne(new LambdaQueryWrapper<WorkspaceMenuCustomization>()
                .eq(WorkspaceMenuCustomization::getTenantId, tenantId)
                .eq(WorkspaceMenuCustomization::getWorkspaceScope, workspaceScope)
                .eq(WorkspaceMenuCustomization::getMenuKey, trimRequired(menuKey, "menu key is required"))
                .last("LIMIT 1"));
    }

    private Map<String, WorkspaceMenuCatalog> mapMenusByKey(List<WorkspaceMenuCatalog> menus) {
        Map<String, WorkspaceMenuCatalog> result = new LinkedHashMap<>();
        for (WorkspaceMenuCatalog menu : menus) {
            result.put(menu.getMenuKey(), menu);
        }
        return result;
    }

    private Map<String, WorkspaceMenuCustomization> mapCustomizationsByKey(List<WorkspaceMenuCustomization> customizations) {
        Map<String, WorkspaceMenuCustomization> result = new LinkedHashMap<>();
        for (WorkspaceMenuCustomization customization : customizations) {
            result.put(customization.getMenuKey(), customization);
        }
        return result;
    }

    private void assertCurrentWorkspaceManager(Long tenantId) {
        if (userDomainService.isPlatformTenant(tenantId)) {
            userDomainService.assertCurrentUserIsSystemSuperAdmin();
            return;
        }
        userDomainService.assertCurrentUserIsTenantSuperAdmin();
    }

    private String resolveCurrentWorkspaceScope(Long tenantId) {
        return userDomainService.isPlatformTenant(tenantId)
                ? WorkspaceMenuCatalogService.WORKSPACE_PLATFORM
                : WorkspaceMenuCatalogService.WORKSPACE_TENANT;
    }

    private String normalizeBaseParentMenuKey(
            WorkspaceMenuCatalog baseMenu,
            Map<String, WorkspaceMenuCatalog> baseMenuByKey,
            Collection<String> includedMenuKeys
    ) {
        String parentMenuKey = trimToNull(baseMenu.getParentMenuKey());
        if (parentMenuKey == null || !includedMenuKeys.contains(parentMenuKey)) {
            return null;
        }
        WorkspaceMenuCatalog parentMenu = baseMenuByKey.get(parentMenuKey);
        if (parentMenu == null || WorkspaceMenuCatalogService.MENU_TYPE_PAGE.equals(parentMenu.getMenuType())) {
            return null;
        }
        return parentMenuKey;
    }

    private String normalizeParentMenuKey(
            String parentMenuKey,
            String currentMenuKey,
            Map<String, WorkspaceMenuCatalog> baseMenuByKey,
            Collection<String> includedMenuKeys
    ) {
        String normalizedParentMenuKey = trimToNull(parentMenuKey);
        if (normalizedParentMenuKey == null) {
            return null;
        }
        if (Objects.equals(currentMenuKey, normalizedParentMenuKey)) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu cannot become its own parent");
        }
        if (!includedMenuKeys.contains(normalizedParentMenuKey)) {
            throw new BizException(ResultCode.PARAM_ERROR, "parent menu is not available in current workspace");
        }
        WorkspaceMenuCatalog parentMenu = baseMenuByKey.get(normalizedParentMenuKey);
        if (parentMenu == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "parent menu not found");
        }
        if (WorkspaceMenuCatalogService.MENU_TYPE_PAGE.equals(parentMenu.getMenuType())) {
            throw new BizException(ResultCode.PARAM_ERROR, "page menu cannot contain child menus");
        }
        return normalizedParentMenuKey;
    }

    private String resolveStoredParentMenuKey(
            String parentMenuKey,
            String currentMenuKey,
            Map<String, WorkspaceMenuCatalog> baseMenuByKey,
            Collection<String> includedMenuKeys
    ) {
        String normalizedParentMenuKey = trimToNull(parentMenuKey);
        if (normalizedParentMenuKey == null) {
            return null;
        }
        if (Objects.equals(currentMenuKey, normalizedParentMenuKey)) {
            return null;
        }
        if (!includedMenuKeys.contains(normalizedParentMenuKey)) {
            return null;
        }
        WorkspaceMenuCatalog parentMenu = baseMenuByKey.get(normalizedParentMenuKey);
        if (parentMenu == null || WorkspaceMenuCatalogService.MENU_TYPE_PAGE.equals(parentMenu.getMenuType())) {
            return null;
        }
        return normalizedParentMenuKey;
    }

    private Integer defaultSortOrder(Integer sortOrder) {
        return sortOrder == null ? 0 : sortOrder;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private Long requireUserId() {
        Long userId = AppContextHolder.getUserId();
        if (userId == null || userId <= 0) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
        return userId;
    }

    private String trimRequired(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return trimmed;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
