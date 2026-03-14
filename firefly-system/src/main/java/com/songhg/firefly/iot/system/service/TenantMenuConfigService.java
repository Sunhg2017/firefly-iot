package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.TenantMenuConfigConvert;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAssignDTO;
import com.songhg.firefly.iot.system.entity.TenantMenuConfig;
import com.songhg.firefly.iot.system.mapper.TenantMenuConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TenantMenuConfigService {

    private final TenantMenuConfigMapper menuConfigMapper;

    public List<MenuConfigVO> getMenuTree(Long tenantId) {
        return buildTree(listByTenantId(tenantId));
    }

    public List<MenuConfigVO> getMenuList(Long tenantId) {
        return listByTenantId(tenantId).stream()
                .map(TenantMenuConfigConvert.INSTANCE::toVO)
                .toList();
    }

    public List<MenuConfigVO> getMenuTree() {
        return getMenuTree(requireTenantId());
    }

    public List<MenuConfigVO> getMenuList() {
        return getMenuList(requireTenantId());
    }

    @Transactional
    public List<MenuConfigVO> replaceMenus(Long tenantId, List<TenantSpaceMenuAssignDTO> items) {
        menuConfigMapper.delete(new LambdaQueryWrapper<TenantMenuConfig>()
                .eq(TenantMenuConfig::getTenantId, tenantId));

        if (items == null || items.isEmpty()) {
            return List.of();
        }

        Long operatorId = AppContextHolder.getUserId();
        Map<String, Long> insertedIds = new LinkedHashMap<>();
        LinkedHashSet<String> seenMenuKeys = new LinkedHashSet<>();

        for (TenantSpaceMenuAssignDTO item : items) {
            String menuKey = trimRequired(item.getMenuKey(), "菜单标识不能为空");
            if (!seenMenuKeys.add(menuKey)) {
                throw new BizException(ResultCode.PARAM_ERROR, "菜单标识重复: " + menuKey);
            }

            String parentMenuKey = trimToNull(item.getParentMenuKey());
            Long parentId = 0L;
            if (parentMenuKey != null) {
                parentId = insertedIds.get(parentMenuKey);
                if (parentId == null) {
                    throw new BizException(ResultCode.PARAM_ERROR, "上级菜单不存在: " + parentMenuKey);
                }
            }

            TenantMenuConfig entity = new TenantMenuConfig();
            entity.setTenantId(tenantId);
            entity.setParentId(parentId);
            entity.setMenuKey(menuKey);
            entity.setLabel(trimRequired(item.getLabel(), "菜单名称不能为空"));
            entity.setIcon(trimToNull(item.getIcon()));
            entity.setRoutePath(trimToNull(item.getRoutePath()));
            entity.setSortOrder(item.getSortOrder() != null ? item.getSortOrder() : 0);
            entity.setVisible(item.getVisible() == null || item.getVisible());
            entity.setCreatedBy(operatorId);
            menuConfigMapper.insert(entity);
            insertedIds.put(menuKey, entity.getId());
        }

        return getMenuTree(tenantId);
    }

    private List<TenantMenuConfig> listByTenantId(Long tenantId) {
        return menuConfigMapper.selectList(new LambdaQueryWrapper<TenantMenuConfig>()
                .eq(TenantMenuConfig::getTenantId, tenantId)
                .orderByAsc(TenantMenuConfig::getSortOrder)
                .orderByAsc(TenantMenuConfig::getId));
    }

    private List<MenuConfigVO> buildTree(List<TenantMenuConfig> records) {
        if (records == null || records.isEmpty()) {
            return List.of();
        }

        List<MenuConfigVO> items = records.stream()
                .map(TenantMenuConfigConvert.INSTANCE::toVO)
                .toList();

        Map<Long, List<MenuConfigVO>> childrenByParent = items.stream()
                .collect(Collectors.groupingBy(item -> item.getParentId() == null ? 0L : item.getParentId()));

        for (MenuConfigVO item : items) {
            List<MenuConfigVO> children = new ArrayList<>(childrenByParent.getOrDefault(item.getId(), List.of()));
            children.sort(Comparator
                    .comparing(MenuConfigVO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                    .thenComparing(MenuConfigVO::getId, Comparator.nullsLast(Long::compareTo)));
            item.setChildren(children);
        }

        List<MenuConfigVO> roots = new ArrayList<>(childrenByParent.getOrDefault(0L, List.of()));
        roots.sort(Comparator
                .comparing(MenuConfigVO::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(MenuConfigVO::getId, Comparator.nullsLast(Long::compareTo)));
        return roots;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
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
