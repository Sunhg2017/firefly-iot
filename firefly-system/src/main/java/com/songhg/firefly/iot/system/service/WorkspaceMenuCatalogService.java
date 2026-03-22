package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuPermissionVO;
import com.songhg.firefly.iot.system.entity.PermissionResource;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCatalog;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuPermissionCatalog;
import com.songhg.firefly.iot.system.mapper.PermissionResourceMapper;
import com.songhg.firefly.iot.system.mapper.WorkspaceMenuCatalogMapper;
import com.songhg.firefly.iot.system.mapper.WorkspaceMenuPermissionCatalogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspaceMenuCatalogService {

    public static final String WORKSPACE_PLATFORM = "PLATFORM";
    public static final String WORKSPACE_TENANT = "TENANT";
    public static final String MENU_TYPE_GROUP = "GROUP";
    public static final String MENU_TYPE_PAGE = "PAGE";

    private final WorkspaceMenuCatalogMapper workspaceMenuCatalogMapper;
    private final WorkspaceMenuPermissionCatalogMapper workspaceMenuPermissionCatalogMapper;
    private final PermissionResourceMapper permissionResourceMapper;

    public List<WorkspaceMenuCatalog> listMenusByScope(String workspaceScope) {
        return workspaceMenuCatalogMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuCatalog>()
                .eq(WorkspaceMenuCatalog::getWorkspaceScope, normalizeWorkspaceScope(workspaceScope))
                .orderByAsc(WorkspaceMenuCatalog::getSortOrder)
                .orderByAsc(WorkspaceMenuCatalog::getId));
    }

    public List<WorkspaceMenuPermissionCatalog> listPermissionsByScope(String workspaceScope) {
        return workspaceMenuPermissionCatalogMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, normalizeWorkspaceScope(workspaceScope))
                .orderByAsc(WorkspaceMenuPermissionCatalog::getPermissionSortOrder)
                .orderByAsc(WorkspaceMenuPermissionCatalog::getId));
    }

    public WorkspaceMenuCatalog requireMenu(String workspaceScope, String menuKey) {
        WorkspaceMenuCatalog menu = workspaceMenuCatalogMapper.selectOne(new LambdaQueryWrapper<WorkspaceMenuCatalog>()
                .eq(WorkspaceMenuCatalog::getWorkspaceScope, normalizeWorkspaceScope(workspaceScope))
                .eq(WorkspaceMenuCatalog::getMenuKey, normalizeMenuKey(menuKey))
                .last("LIMIT 1"));
        if (menu == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu not found: " + menuKey);
        }
        return menu;
    }

    public List<WorkspaceMenuNodeVO> buildMenuTree(String workspaceScope) {
        return buildMenuTree(workspaceScope, Set.of());
    }

    public List<WorkspaceMenuNodeVO> buildMenuTree(String workspaceScope, Collection<String> selectedMenuKeys) {
        return buildMenuTree(
                listMenusByScope(workspaceScope),
                listPermissionsByScope(workspaceScope),
                selectedMenuKeys);
    }

    public Set<String> listVisibleRoutePathsByScope(String workspaceScope) {
        return listMenusByScope(workspaceScope).stream()
                .filter(item -> Boolean.TRUE.equals(item.getVisible()))
                .map(WorkspaceMenuCatalog::getRoutePath)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
    }

    public Set<String> listAllPermissionCodesByScope(String workspaceScope) {
        return listPermissionsByScope(workspaceScope).stream()
                .map(WorkspaceMenuPermissionCatalog::getPermissionCode)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
    }

    public Set<String> listPermissionCodesForMenuKeys(String workspaceScope, Collection<String> menuKeys) {
        Set<String> normalizedMenuKeys = normalizeMenuKeys(menuKeys);
        if (normalizedMenuKeys.isEmpty()) {
            return Set.of();
        }
        return workspaceMenuPermissionCatalogMapper.selectList(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                        .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, normalizeWorkspaceScope(workspaceScope))
                        .in(WorkspaceMenuPermissionCatalog::getMenuKey, normalizedMenuKeys)
                        .orderByAsc(WorkspaceMenuPermissionCatalog::getPermissionSortOrder)
                        .orderByAsc(WorkspaceMenuPermissionCatalog::getId))
                .stream()
                .map(WorkspaceMenuPermissionCatalog::getPermissionCode)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
    }

    @Transactional
    public WorkspaceMenuCatalog createMenu(WorkspaceMenuCatalog menu) {
        String workspaceScope = normalizeWorkspaceScope(menu.getWorkspaceScope());
        String menuKey = normalizeMenuKey(menu.getMenuKey());
        ensureMenuKeyAvailable(workspaceScope, menuKey, null);

        WorkspaceMenuCatalog parent = null;
        String parentMenuKey = trimToNull(menu.getParentMenuKey());
        if (parentMenuKey != null) {
            parent = requireMenu(workspaceScope, parentMenuKey);
            if (isPage(parent)) {
                throw new BizException(ResultCode.PARAM_ERROR, "page menu cannot contain child menus");
            }
        }

        WorkspaceMenuCatalog entity = new WorkspaceMenuCatalog();
        entity.setWorkspaceScope(workspaceScope);
        entity.setMenuKey(menuKey);
        entity.setParentMenuKey(parent != null ? parent.getMenuKey() : null);
        entity.setLabel(trimRequired(menu.getLabel(), "menu label is required"));
        entity.setIcon(trimRequired(menu.getIcon(), "menu icon is required"));
        entity.setRoutePath(normalizeRoutePath(menu.getRoutePath()));
        entity.setMenuType(resolveMenuType(entity.getRoutePath()));
        entity.setSortOrder(menu.getSortOrder() != null ? menu.getSortOrder() : 0);
        entity.setVisible(menu.getVisible() == null || menu.getVisible());
        entity.setRoleCatalogVisible(Boolean.TRUE.equals(menu.getRoleCatalogVisible()) && isPage(entity));
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        workspaceMenuCatalogMapper.insert(entity);
        return entity;
    }

    @Transactional
    public WorkspaceMenuCatalog updateMenu(String workspaceScope, String menuKey, WorkspaceMenuCatalog changes) {
        WorkspaceMenuCatalog existing = requireMenu(workspaceScope, menuKey);
        WorkspaceMenuCatalog parent = null;
        String nextParentMenuKey = trimToNull(changes.getParentMenuKey());
        if (nextParentMenuKey != null) {
            if (Objects.equals(existing.getMenuKey(), nextParentMenuKey)) {
                throw new BizException(ResultCode.PARAM_ERROR, "menu cannot become its own parent");
            }
            parent = requireMenu(existing.getWorkspaceScope(), nextParentMenuKey);
            if (isPage(parent)) {
                throw new BizException(ResultCode.PARAM_ERROR, "page menu cannot contain child menus");
            }
            ensureNotMoveUnderDescendant(existing, parent.getMenuKey());
        }

        String nextRoutePath = normalizeRoutePath(changes.getRoutePath());
        if (nextRoutePath != null && hasChildren(existing)) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu with children cannot be converted to page");
        }

        existing.setParentMenuKey(parent != null ? parent.getMenuKey() : null);
        existing.setLabel(trimRequired(changes.getLabel(), "menu label is required"));
        existing.setIcon(trimRequired(changes.getIcon(), "menu icon is required"));
        existing.setRoutePath(nextRoutePath);
        existing.setMenuType(resolveMenuType(nextRoutePath));
        existing.setSortOrder(changes.getSortOrder() != null ? changes.getSortOrder() : 0);
        existing.setVisible(changes.getVisible() == null || changes.getVisible());
        existing.setRoleCatalogVisible(Boolean.TRUE.equals(changes.getRoleCatalogVisible()) && isPage(existing));
        existing.setUpdatedAt(LocalDateTime.now());
        workspaceMenuCatalogMapper.updateById(existing);
        return existing;
    }

    @Transactional
    public void deleteMenu(String workspaceScope, String menuKey) {
        WorkspaceMenuCatalog root = requireMenu(workspaceScope, menuKey);
        Set<String> menuKeys = collectSubtreeMenuKeys(root.getWorkspaceScope(), root.getMenuKey());
        if (menuKeys.isEmpty()) {
            return;
        }
        workspaceMenuPermissionCatalogMapper.delete(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, root.getWorkspaceScope())
                .in(WorkspaceMenuPermissionCatalog::getMenuKey, menuKeys));
        workspaceMenuCatalogMapper.delete(new LambdaQueryWrapper<WorkspaceMenuCatalog>()
                .eq(WorkspaceMenuCatalog::getWorkspaceScope, root.getWorkspaceScope())
                .in(WorkspaceMenuCatalog::getMenuKey, menuKeys));
    }

    @Transactional
    public List<WorkspaceMenuPermissionCatalog> replaceMenuPermissions(
            String workspaceScope,
            String menuKey,
            Collection<String> permissionCodes
    ) {
        WorkspaceMenuCatalog menu = requireMenu(workspaceScope, menuKey);
        if (!isPage(menu)) {
            throw new BizException(ResultCode.PARAM_ERROR, "group menu cannot bind permissions");
        }

        Set<String> normalizedCodes = normalizePermissionCodes(permissionCodes);
        Map<String, PermissionResource> resourcesByCode = loadPermissionResources(normalizedCodes);

        workspaceMenuPermissionCatalogMapper.delete(new LambdaQueryWrapper<WorkspaceMenuPermissionCatalog>()
                .eq(WorkspaceMenuPermissionCatalog::getWorkspaceScope, menu.getWorkspaceScope())
                .eq(WorkspaceMenuPermissionCatalog::getMenuKey, menu.getMenuKey()));

        if (normalizedCodes.isEmpty()) {
            return List.of();
        }

        List<WorkspaceMenuPermissionCatalog> rows = new ArrayList<>();
        int fallbackOrder = 0;
        for (PermissionResource resource : resourcesByCode.values()) {
            WorkspaceMenuPermissionCatalog row = new WorkspaceMenuPermissionCatalog();
            row.setWorkspaceScope(menu.getWorkspaceScope());
            row.setMenuKey(menu.getMenuKey());
            row.setPermissionCode(resource.getCode());
            row.setPermissionLabel(resource.getName());
            row.setPermissionSortOrder(resource.getSortOrder() != null ? resource.getSortOrder() : fallbackOrder++);
            row.setCreatedAt(LocalDateTime.now());
            row.setUpdatedAt(LocalDateTime.now());
            workspaceMenuPermissionCatalogMapper.insert(row);
            rows.add(row);
        }
        return rows;
    }

    public Set<String> collectSubtreeMenuKeys(String workspaceScope, String menuKey) {
        List<WorkspaceMenuCatalog> menus = listMenusByScope(workspaceScope);
        Map<String, List<WorkspaceMenuCatalog>> childrenByParent = new LinkedHashMap<>();
        for (WorkspaceMenuCatalog menu : menus) {
            childrenByParent.computeIfAbsent(trimToNull(menu.getParentMenuKey()), ignored -> new ArrayList<>()).add(menu);
        }

        Set<String> menuKeys = new LinkedHashSet<>();
        collectSubtreeKeys(childrenByParent, normalizeMenuKey(menuKey), menuKeys);
        return menuKeys;
    }

    public List<WorkspaceMenuNodeVO> buildMenuTree(
            List<WorkspaceMenuCatalog> menus,
            List<WorkspaceMenuPermissionCatalog> permissions,
            Collection<String> selectedMenuKeys
    ) {
        if (menus == null || menus.isEmpty()) {
            return List.of();
        }

        Set<String> selected = normalizeMenuKeys(selectedMenuKeys);
        Map<String, List<WorkspaceMenuPermissionVO>> permissionsByMenuKey = new LinkedHashMap<>();
        if (permissions != null) {
            for (WorkspaceMenuPermissionCatalog item : permissions) {
                WorkspaceMenuPermissionVO permissionVO = new WorkspaceMenuPermissionVO();
                permissionVO.setPermissionCode(item.getPermissionCode());
                permissionVO.setPermissionLabel(item.getPermissionLabel());
                permissionVO.setSortOrder(item.getPermissionSortOrder());
                permissionsByMenuKey.computeIfAbsent(item.getMenuKey(), ignored -> new ArrayList<>()).add(permissionVO);
            }
        }

        Map<String, WorkspaceMenuNodeVO> nodeByKey = new LinkedHashMap<>();
        for (WorkspaceMenuCatalog menu : menus) {
            WorkspaceMenuNodeVO node = new WorkspaceMenuNodeVO();
            node.setWorkspaceScope(menu.getWorkspaceScope());
            node.setMenuKey(menu.getMenuKey());
            node.setParentMenuKey(menu.getParentMenuKey());
            node.setLabel(menu.getLabel());
            node.setIcon(menu.getIcon());
            node.setRoutePath(menu.getRoutePath());
            node.setMenuType(menu.getMenuType());
            node.setSortOrder(menu.getSortOrder());
            node.setVisible(menu.getVisible());
            node.setRoleCatalogVisible(menu.getRoleCatalogVisible());
            node.setSelected(selected.contains(menu.getMenuKey()));
            node.setPermissions(new ArrayList<>(permissionsByMenuKey.getOrDefault(menu.getMenuKey(), List.of())));
            nodeByKey.put(menu.getMenuKey(), node);
        }

        List<WorkspaceMenuNodeVO> roots = new ArrayList<>();
        for (WorkspaceMenuCatalog menu : menus) {
            WorkspaceMenuNodeVO node = nodeByKey.get(menu.getMenuKey());
            String parentMenuKey = trimToNull(menu.getParentMenuKey());
            if (parentMenuKey == null) {
                roots.add(node);
                continue;
            }
            WorkspaceMenuNodeVO parent = nodeByKey.get(parentMenuKey);
            if (parent == null) {
                roots.add(node);
                continue;
            }
            parent.getChildren().add(node);
        }
        sortNodes(roots);
        return roots;
    }

    public String normalizeWorkspaceScope(String workspaceScope) {
        String normalized = trimToNull(workspaceScope);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "workspace scope is required");
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!WORKSPACE_PLATFORM.equals(normalized) && !WORKSPACE_TENANT.equals(normalized)) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid workspace scope: " + workspaceScope);
        }
        return normalized;
    }

    public Set<String> normalizeMenuKeys(Collection<String> menuKeys) {
        Set<String> result = new LinkedHashSet<>();
        if (menuKeys == null) {
            return result;
        }
        for (String menuKey : menuKeys) {
            String normalized = trimToNull(menuKey);
            if (normalized != null) {
                result.add(normalized);
            }
        }
        return result;
    }

    private void ensureMenuKeyAvailable(String workspaceScope, String menuKey, Long ignoreId) {
        WorkspaceMenuCatalog existing = workspaceMenuCatalogMapper.selectOne(new LambdaQueryWrapper<WorkspaceMenuCatalog>()
                .eq(WorkspaceMenuCatalog::getWorkspaceScope, workspaceScope)
                .eq(WorkspaceMenuCatalog::getMenuKey, menuKey)
                .last("LIMIT 1"));
        if (existing != null && !Objects.equals(existing.getId(), ignoreId)) {
            throw new BizException(ResultCode.PARAM_ERROR, "duplicate menu key: " + menuKey);
        }
    }

    private void ensureNotMoveUnderDescendant(WorkspaceMenuCatalog source, String nextParentMenuKey) {
        Set<String> subtreeKeys = collectSubtreeMenuKeys(source.getWorkspaceScope(), source.getMenuKey());
        if (subtreeKeys.contains(nextParentMenuKey)) {
            throw new BizException(ResultCode.PARAM_ERROR, "menu cannot move under its descendant");
        }
    }

    private boolean hasChildren(WorkspaceMenuCatalog menu) {
        Long count = workspaceMenuCatalogMapper.selectCount(new LambdaQueryWrapper<WorkspaceMenuCatalog>()
                .eq(WorkspaceMenuCatalog::getWorkspaceScope, menu.getWorkspaceScope())
                .eq(WorkspaceMenuCatalog::getParentMenuKey, menu.getMenuKey()));
        return count != null && count > 0;
    }

    private void collectSubtreeKeys(
            Map<String, List<WorkspaceMenuCatalog>> childrenByParent,
            String currentMenuKey,
            Set<String> collector
    ) {
        collector.add(currentMenuKey);
        for (WorkspaceMenuCatalog child : childrenByParent.getOrDefault(currentMenuKey, List.of())) {
            collectSubtreeKeys(childrenByParent, child.getMenuKey(), collector);
        }
    }

    private Map<String, PermissionResource> loadPermissionResources(Set<String> permissionCodes) {
        if (permissionCodes.isEmpty()) {
            return Map.of();
        }
        List<PermissionResource> resources = permissionResourceMapper.selectList(new LambdaQueryWrapper<PermissionResource>()
                .in(PermissionResource::getCode, permissionCodes)
                .eq(PermissionResource::getEnabled, true)
                .orderByAsc(PermissionResource::getSortOrder)
                .orderByAsc(PermissionResource::getId));
        Map<String, PermissionResource> resourcesByCode = new LinkedHashMap<>();
        for (PermissionResource resource : resources) {
            resourcesByCode.put(resource.getCode(), resource);
        }
        List<String> missingCodes = permissionCodes.stream()
                .filter(code -> !resourcesByCode.containsKey(code))
                .toList();
        if (!missingCodes.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid permission codes: " + String.join(", ", missingCodes));
        }
        return resourcesByCode;
    }

    private Set<String> normalizePermissionCodes(Collection<String> permissionCodes) {
        Set<String> normalized = new LinkedHashSet<>();
        if (permissionCodes == null) {
            return normalized;
        }
        for (String permissionCode : permissionCodes) {
            String trimmed = trimToNull(permissionCode);
            if (trimmed != null) {
                normalized.add(trimmed);
            }
        }
        return normalized;
    }

    private void sortNodes(List<WorkspaceMenuNodeVO> nodes) {
        nodes.sort(Comparator
                .comparing(WorkspaceMenuNodeVO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(WorkspaceMenuNodeVO::getMenuKey, Comparator.nullsLast(String::compareTo)));
        for (WorkspaceMenuNodeVO node : nodes) {
            if (node.getPermissions() != null) {
                node.getPermissions().sort(Comparator
                        .comparing(WorkspaceMenuPermissionVO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                        .thenComparing(WorkspaceMenuPermissionVO::getPermissionCode, Comparator.nullsLast(String::compareTo)));
            }
            if (node.getChildren() != null && !node.getChildren().isEmpty()) {
                sortNodes(node.getChildren());
            }
        }
    }

    private boolean isPage(WorkspaceMenuCatalog menu) {
        return MENU_TYPE_PAGE.equals(menu.getMenuType());
    }

    private String resolveMenuType(String routePath) {
        return routePath == null ? MENU_TYPE_GROUP : MENU_TYPE_PAGE;
    }

    private String normalizeRoutePath(String routePath) {
        String normalized = trimToNull(routePath);
        if (normalized == null) {
            return null;
        }
        return normalized.startsWith("/") ? normalized : "/" + normalized;
    }

    private String normalizeMenuKey(String menuKey) {
        return trimRequired(menuKey, "menu key is required");
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
