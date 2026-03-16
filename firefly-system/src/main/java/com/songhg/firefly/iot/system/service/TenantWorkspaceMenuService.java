package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAuthorizationVO;
import com.songhg.firefly.iot.system.entity.TenantMenuConfig;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCatalog;
import com.songhg.firefly.iot.system.mapper.TenantMenuConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class TenantWorkspaceMenuService {

    private final TenantMenuConfigMapper tenantMenuConfigMapper;
    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;

    public Set<String> listAuthorizedMenuKeys(Long tenantId) {
        Set<String> authorizedMenuKeys = tenantMenuConfigMapper.selectList(new LambdaQueryWrapper<TenantMenuConfig>()
                        .eq(TenantMenuConfig::getTenantId, tenantId)
                        .orderByAsc(TenantMenuConfig::getId))
                .stream()
                .map(TenantMenuConfig::getMenuKey)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
        authorizedMenuKeys.add(WorkspaceMenuCustomizationService.REQUIRED_TENANT_MENU_KEY);
        return authorizedMenuKeys;
    }

    public Set<String> listAuthorizedRoutePaths(Long tenantId) {
        Set<String> authorizedMenuKeys = listAuthorizedMenuKeys(tenantId);
        if (authorizedMenuKeys.isEmpty()) {
            return Set.of();
        }

        List<WorkspaceMenuCatalog> menus = workspaceMenuCatalogService.listMenusByScope(WorkspaceMenuCatalogService.WORKSPACE_TENANT);
        Map<String, WorkspaceMenuCatalog> menuByKey = new LinkedHashMap<>();
        for (WorkspaceMenuCatalog menu : menus) {
            menuByKey.put(menu.getMenuKey(), menu);
        }

        Set<String> effectiveMenuKeys = new LinkedHashSet<>(authorizedMenuKeys);
        for (String menuKey : authorizedMenuKeys) {
            WorkspaceMenuCatalog current = menuByKey.get(menuKey);
            while (current != null && current.getParentMenuKey() != null) {
                effectiveMenuKeys.add(current.getParentMenuKey());
                current = menuByKey.get(current.getParentMenuKey());
            }
        }

        Set<String> routePaths = new LinkedHashSet<>();
        for (WorkspaceMenuCatalog menu : menus) {
            if (!effectiveMenuKeys.contains(menu.getMenuKey()) || !Boolean.TRUE.equals(menu.getVisible())) {
                continue;
            }
            if (menu.getRoutePath() != null) {
                routePaths.add(menu.getRoutePath());
            }
        }
        return routePaths;
    }

    public TenantSpaceMenuAuthorizationVO getTenantSpaceAuthorization(Long tenantId) {
        Set<String> selectedMenuKeys = listAuthorizedMenuKeys(tenantId);
        TenantSpaceMenuAuthorizationVO result = new TenantSpaceMenuAuthorizationVO();
        result.setSelectedMenuKeys(new ArrayList<>(selectedMenuKeys));
        result.setMenuTree(workspaceMenuCatalogService.buildMenuTree(
                WorkspaceMenuCatalogService.WORKSPACE_TENANT,
                selectedMenuKeys));
        return result;
    }

    @Transactional
    public TenantSpaceMenuAuthorizationVO replaceAuthorizedMenus(Long tenantId, Collection<String> menuKeys) {
        Set<String> normalizedMenuKeys = workspaceMenuCatalogService.normalizeMenuKeys(menuKeys);
        if (normalizedMenuKeys.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "please select at least one tenant workspace menu");
        }
        normalizedMenuKeys.add(WorkspaceMenuCustomizationService.REQUIRED_TENANT_MENU_KEY);

        Set<String> grantableMenuKeys = listGrantableTenantMenuKeys();
        List<String> invalidMenuKeys = normalizedMenuKeys.stream()
                .filter(menuKey -> !grantableMenuKeys.contains(menuKey))
                .toList();
        if (!invalidMenuKeys.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid tenant menu keys: " + String.join(", ", invalidMenuKeys));
        }

        tenantMenuConfigMapper.delete(new LambdaQueryWrapper<TenantMenuConfig>()
                .eq(TenantMenuConfig::getTenantId, tenantId));

        Long operatorId = AppContextHolder.getUserId();
        for (String menuKey : normalizedMenuKeys) {
            TenantMenuConfig record = new TenantMenuConfig();
            record.setTenantId(tenantId);
            record.setMenuKey(menuKey);
            record.setCreatedBy(operatorId);
            tenantMenuConfigMapper.insert(record);
        }
        return getTenantSpaceAuthorization(tenantId);
    }

    @Transactional
    public void grantDefaultMenus(Long tenantId) {
        replaceAuthorizedMenus(tenantId, listGrantableTenantMenuKeys());
    }

    @Transactional
    public void deleteAuthorizationsByMenuKeys(Collection<String> menuKeys) {
        Set<String> normalizedMenuKeys = workspaceMenuCatalogService.normalizeMenuKeys(menuKeys);
        if (normalizedMenuKeys.isEmpty()) {
            return;
        }
        tenantMenuConfigMapper.delete(new LambdaQueryWrapper<TenantMenuConfig>()
                .in(TenantMenuConfig::getMenuKey, normalizedMenuKeys));
    }

    private Set<String> listGrantableTenantMenuKeys() {
        return workspaceMenuCatalogService.listMenusByScope(WorkspaceMenuCatalogService.WORKSPACE_TENANT).stream()
                .filter(item -> WorkspaceMenuCatalogService.MENU_TYPE_PAGE.equals(item.getMenuType()))
                .filter(item -> Boolean.TRUE.equals(item.getVisible()))
                .map(WorkspaceMenuCatalog::getMenuKey)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
    }
}
