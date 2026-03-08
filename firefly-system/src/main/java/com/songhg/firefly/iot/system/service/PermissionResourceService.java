package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.entity.PermissionResource;
import com.songhg.firefly.iot.system.entity.RolePermission;
import com.songhg.firefly.iot.system.mapper.PermissionResourceMapper;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionResourceService {

    private final PermissionResourceMapper resourceMapper;
    private final RolePermissionMapper rolePermissionMapper;

    @Transactional
    public PermissionResource create(PermissionResource resource) {
        Long exists = resourceMapper.selectCount(new LambdaQueryWrapper<PermissionResource>()
                .eq(PermissionResource::getCode, resource.getCode()));
        if (exists > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "权限编码已存在");
        }
        if (resource.getParentId() == null) resource.setParentId(0L);
        if (resource.getSortOrder() == null) resource.setSortOrder(0);
        if (resource.getEnabled() == null) resource.setEnabled(true);
        resource.setCreatedAt(LocalDateTime.now());
        resource.setUpdatedAt(LocalDateTime.now());
        resourceMapper.insert(resource);
        log.info("PermissionResource created: id={}, code={}, type={}", resource.getId(), resource.getCode(), resource.getType());
        return resource;
    }

    public PermissionResource getById(Long id) {
        PermissionResource r = resourceMapper.selectById(id);
        if (r == null) throw new BizException(ResultCode.PARAM_ERROR, "权限资源不存在");
        return r;
    }

    public List<PermissionResource> listAll() {
        return resourceMapper.selectList(new LambdaQueryWrapper<PermissionResource>()
                .orderByAsc(PermissionResource::getSortOrder)
                .orderByAsc(PermissionResource::getId));
    }

    /**
     * 构建权限树
     */
    public List<Map<String, Object>> getTree() {
        List<PermissionResource> all = listAll();
        return buildTree(all, 0L);
    }

    private List<Map<String, Object>> buildTree(List<PermissionResource> all, Long parentId) {
        List<Map<String, Object>> tree = new ArrayList<>();
        for (PermissionResource r : all) {
            if (Objects.equals(r.getParentId(), parentId)) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", r.getId());
                node.put("parentId", r.getParentId());
                node.put("code", r.getCode());
                node.put("name", r.getName());
                node.put("type", r.getType());
                node.put("icon", r.getIcon());
                node.put("path", r.getPath());
                node.put("sortOrder", r.getSortOrder());
                node.put("enabled", r.getEnabled());
                node.put("description", r.getDescription());
                List<Map<String, Object>> children = buildTree(all, r.getId());
                if (!children.isEmpty()) node.put("children", children);
                tree.add(node);
            }
        }
        return tree;
    }

    /**
     * 按类型查询
     */
    public List<PermissionResource> listByType(String type) {
        return resourceMapper.selectList(new LambdaQueryWrapper<PermissionResource>()
                .eq(PermissionResource::getType, type)
                .orderByAsc(PermissionResource::getSortOrder));
    }

    @Transactional
    public PermissionResource update(Long id, PermissionResource update) {
        PermissionResource r = getById(id);
        if (update.getName() != null) r.setName(update.getName());
        if (update.getType() != null) r.setType(update.getType());
        if (update.getIcon() != null) r.setIcon(update.getIcon());
        if (update.getPath() != null) r.setPath(update.getPath());
        if (update.getSortOrder() != null) r.setSortOrder(update.getSortOrder());
        if (update.getEnabled() != null) r.setEnabled(update.getEnabled());
        if (update.getDescription() != null) r.setDescription(update.getDescription());
        if (update.getParentId() != null) r.setParentId(update.getParentId());
        r.setUpdatedAt(LocalDateTime.now());
        resourceMapper.updateById(r);
        return r;
    }

    @Transactional
    public void delete(Long id) {
        long childCount = resourceMapper.selectCount(new LambdaQueryWrapper<PermissionResource>()
                .eq(PermissionResource::getParentId, id));
        if (childCount > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "请先删除子权限");
        }
        resourceMapper.deleteById(id);
    }

    /**
     * 获取角色已分配的权限编码列表
     */
    public List<String> getRolePermissions(Long roleId) {
        return rolePermissionMapper.selectList(new LambdaQueryWrapper<RolePermission>()
                .eq(RolePermission::getRoleId, roleId))
                .stream().map(RolePermission::getPermission).collect(Collectors.toList());
    }

    /**
     * 为角色分配权限
     */
    @Transactional
    public void assignRolePermissions(Long roleId, List<String> permissionCodes) {
        rolePermissionMapper.delete(new LambdaQueryWrapper<RolePermission>()
                .eq(RolePermission::getRoleId, roleId));
        if (permissionCodes != null) {
            for (String code : permissionCodes) {
                RolePermission rp = new RolePermission();
                rp.setRoleId(roleId);
                rp.setPermission(code);
                rp.setCreatedAt(LocalDateTime.now());
                rolePermissionMapper.insert(rp);
            }
        }
        log.info("Role permissions assigned: roleId={}, count={}", roleId, permissionCodes != null ? permissionCodes.size() : 0);
    }
}
