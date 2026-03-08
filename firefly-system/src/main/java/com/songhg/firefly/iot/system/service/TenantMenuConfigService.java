package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.TenantMenuConfigConvert;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigCreateDTO;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigSortDTO;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigUpdateDTO;
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
    private final UserDomainService userDomainService;

    /**
     * 查询当前租户的菜单配置（树形结构）
     */
    public List<MenuConfigVO> getMenuTree() {
        return getMenuTree(TenantContextHolder.getTenantId());
    }

    /**
     * 查询当前租户的菜单配置（扁平列表）
     */
    public List<MenuConfigVO> getMenuList() {
        return getMenuList(TenantContextHolder.getTenantId());
    }

    public List<MenuConfigVO> getMenuTree(Long tenantId) {
        return buildTree(listByTenantId(tenantId));
    }

    public List<MenuConfigVO> getMenuList(Long tenantId) {
        return listByTenantId(tenantId).stream()
                .map(TenantMenuConfigConvert.INSTANCE::toVO)
                .collect(Collectors.toList());
    }

    @Transactional
    public List<MenuConfigVO> replaceMenus(Long tenantId, List<TenantSpaceMenuAssignDTO> items) {
        LambdaQueryWrapper<TenantMenuConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantMenuConfig::getTenantId, tenantId);
        menuConfigMapper.delete(wrapper);

        if (items == null || items.isEmpty()) {
            return List.of();
        }

        Long userId = UserContextHolder.getUserId();
        Map<String, Long> menuKeyIdMap = new LinkedHashMap<>();
        LinkedHashSet<String> seenKeys = new LinkedHashSet<>();
        for (TenantSpaceMenuAssignDTO item : items) {
            String menuKey = StringUtils.trimWhitespace(item.getMenuKey());
            if (!StringUtils.hasText(menuKey)) {
                throw new BizException(ResultCode.PARAM_ERROR, "菜单标识不能为空");
            }
            if (!seenKeys.add(menuKey)) {
                throw new BizException(ResultCode.PARAM_ERROR, "菜单标识重复: " + menuKey);
            }

            String parentMenuKey = StringUtils.trimWhitespace(item.getParentMenuKey());
            Long parentId = 0L;
            if (StringUtils.hasText(parentMenuKey)) {
                parentId = menuKeyIdMap.get(parentMenuKey);
                if (parentId == null) {
                    throw new BizException(ResultCode.PARAM_ERROR, "上级菜单不存在: " + parentMenuKey);
                }
            }

            TenantMenuConfig entity = new TenantMenuConfig();
            entity.setTenantId(tenantId);
            entity.setParentId(parentId);
            entity.setMenuKey(menuKey);
            entity.setLabel(StringUtils.trimWhitespace(item.getLabel()));
            entity.setIcon(StringUtils.trimWhitespace(item.getIcon()));
            entity.setRoutePath(StringUtils.trimWhitespace(item.getRoutePath()));
            entity.setSortOrder(item.getSortOrder() != null ? item.getSortOrder() : 0);
            entity.setVisible(item.getVisible() != null ? item.getVisible() : true);
            entity.setCreatedBy(userId);
            menuConfigMapper.insert(entity);
            menuKeyIdMap.put(menuKey, entity.getId());
        }

        return getMenuTree(tenantId);
    }

    /**
     * 创建菜单项
     */
    public MenuConfigVO create(MenuConfigCreateDTO dto) {
        userDomainService.assertCurrentUserCanManageWorkspaceMenus();
        Long tenantId = TenantContextHolder.getTenantId();

        // 检查 menuKey 是否已存在
        LambdaQueryWrapper<TenantMenuConfig> check = new LambdaQueryWrapper<>();
        check.eq(TenantMenuConfig::getTenantId, tenantId)
                .eq(TenantMenuConfig::getMenuKey, dto.getMenuKey());
        if (menuConfigMapper.selectCount(check) > 0) {
            throw new BizException(ResultCode.CONFLICT, "菜单标识已存在: " + dto.getMenuKey());
        }

        TenantMenuConfig entity = new TenantMenuConfig();
        entity.setTenantId(tenantId);
        entity.setParentId(dto.getParentId() != null ? dto.getParentId() : 0L);
        entity.setMenuKey(dto.getMenuKey());
        entity.setLabel(dto.getLabel());
        entity.setIcon(dto.getIcon());
        entity.setRoutePath(dto.getRoutePath());
        entity.setSortOrder(dto.getSortOrder() != null ? dto.getSortOrder() : 0);
        entity.setVisible(dto.getVisible() != null ? dto.getVisible() : true);
        entity.setCreatedBy(UserContextHolder.getUserId());
        menuConfigMapper.insert(entity);
        return TenantMenuConfigConvert.INSTANCE.toVO(entity);
    }

    /**
     * 更新菜单项
     */
    public MenuConfigVO update(Long id, MenuConfigUpdateDTO dto) {
        userDomainService.assertCurrentUserCanManageWorkspaceMenus();
        TenantMenuConfig entity = getAndCheck(id);
        if (dto.getParentId() != null) {
            entity.setParentId(dto.getParentId());
        }
        if (dto.getLabel() != null) {
            entity.setLabel(dto.getLabel());
        }
        if (dto.getIcon() != null) {
            entity.setIcon(dto.getIcon());
        }
        if (dto.getRoutePath() != null) {
            entity.setRoutePath(dto.getRoutePath());
        }
        if (dto.getSortOrder() != null) {
            entity.setSortOrder(dto.getSortOrder());
        }
        if (dto.getVisible() != null) {
            entity.setVisible(dto.getVisible());
        }
        menuConfigMapper.updateById(entity);
        return TenantMenuConfigConvert.INSTANCE.toVO(entity);
    }

    /**
     * 删除菜单项（同时删除子菜单）
     */
    @Transactional
    public void delete(Long id) {
        userDomainService.assertCurrentUserCanManageWorkspaceMenus();
        TenantMenuConfig entity = getAndCheck(id);
        Long tenantId = entity.getTenantId();

        // 删除子菜单
        LambdaQueryWrapper<TenantMenuConfig> childWrapper = new LambdaQueryWrapper<>();
        childWrapper.eq(TenantMenuConfig::getTenantId, tenantId)
                .eq(TenantMenuConfig::getParentId, id);
        menuConfigMapper.delete(childWrapper);

        // 删除自身
        menuConfigMapper.deleteById(id);
    }

    /**
     * 批量排序（支持同时调整父级和排序）
     */
    @Transactional
    public void batchSort(List<MenuConfigSortDTO> sortList) {
        userDomainService.assertCurrentUserCanManageWorkspaceMenus();
        Long tenantId = TenantContextHolder.getTenantId();
        for (MenuConfigSortDTO item : sortList) {
            LambdaUpdateWrapper<TenantMenuConfig> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(TenantMenuConfig::getId, item.getId())
                    .eq(TenantMenuConfig::getTenantId, tenantId)
                    .set(TenantMenuConfig::getSortOrder, item.getSortOrder());
            if (item.getParentId() != null) {
                wrapper.set(TenantMenuConfig::getParentId, item.getParentId());
            }
            menuConfigMapper.update(null, wrapper);
        }
    }

    /**
     * 初始化租户菜单（从默认模板复制）
     */
    @Transactional
    public void initDefaultMenus(List<MenuConfigCreateDTO> defaults) {
        userDomainService.assertCurrentUserCanManageWorkspaceMenus();
        Long tenantId = TenantContextHolder.getTenantId();

        // 清除已有配置
        LambdaQueryWrapper<TenantMenuConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantMenuConfig::getTenantId, tenantId);
        menuConfigMapper.delete(wrapper);

        // 批量插入
        Long userId = UserContextHolder.getUserId();
        for (MenuConfigCreateDTO dto : defaults) {
            TenantMenuConfig entity = new TenantMenuConfig();
            entity.setTenantId(tenantId);
            entity.setParentId(dto.getParentId() != null ? dto.getParentId() : 0L);
            entity.setMenuKey(dto.getMenuKey());
            entity.setLabel(dto.getLabel());
            entity.setIcon(dto.getIcon());
            entity.setRoutePath(dto.getRoutePath());
            entity.setSortOrder(dto.getSortOrder() != null ? dto.getSortOrder() : 0);
            entity.setVisible(dto.getVisible() != null ? dto.getVisible() : true);
            entity.setCreatedBy(userId);
            menuConfigMapper.insert(entity);
        }
    }

    private TenantMenuConfig getAndCheck(Long id) {
        TenantMenuConfig entity = menuConfigMapper.selectById(id);
        if (entity == null) {
            throw new BizException(ResultCode.NOT_FOUND, "菜单配置不存在");
        }
        Long tenantId = TenantContextHolder.getTenantId();
        if (!entity.getTenantId().equals(tenantId)) {
            throw new BizException(ResultCode.FORBIDDEN, "无权操作");
        }
        return entity;
    }

    private List<TenantMenuConfig> listByTenantId(Long tenantId) {
        LambdaQueryWrapper<TenantMenuConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantMenuConfig::getTenantId, tenantId)
                .orderByAsc(TenantMenuConfig::getSortOrder)
                .orderByAsc(TenantMenuConfig::getId);
        return menuConfigMapper.selectList(wrapper);
    }

    private List<MenuConfigVO> buildTree(List<TenantMenuConfig> list) {
        List<MenuConfigVO> voList = list.stream()
                .map(TenantMenuConfigConvert.INSTANCE::toVO)
                .collect(Collectors.toList());

        Map<Long, List<MenuConfigVO>> childMap = voList.stream()
                .collect(Collectors.groupingBy(MenuConfigVO::getParentId));

        List<MenuConfigVO> roots = new ArrayList<>();
        for (MenuConfigVO vo : voList) {
            List<MenuConfigVO> children = childMap.get(vo.getId());
            if (children != null) {
                children.sort(Comparator.comparingInt(MenuConfigVO::getSortOrder));
                vo.setChildren(children);
            }
            if (vo.getParentId() == null || vo.getParentId() == 0L) {
                roots.add(vo);
            }
        }
        roots.sort(Comparator.comparingInt(MenuConfigVO::getSortOrder));
        return roots;
    }
}
