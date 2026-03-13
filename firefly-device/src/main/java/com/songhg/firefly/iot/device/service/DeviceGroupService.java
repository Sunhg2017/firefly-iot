package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceGroupConvert;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupMemberVO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupQueryDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMapper;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMemberMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private final DeviceGroupMapper groupMapper;
    private final DeviceGroupMemberMapper memberMapper;
    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;

    @Transactional
    public DeviceGroup createGroup(String name, String description, String type, String dynamicRule, Long parentId) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        String normalizedType = normalizeGroupType(type);
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(null, normalizedParentId, tenantId);

        DeviceGroup group = new DeviceGroup();
        group.setTenantId(tenantId);
        group.setName(name);
        group.setDescription(description);
        group.setType(normalizedType);
        group.setDynamicRule(normalizedType.equals("DYNAMIC") ? trimToNull(dynamicRule) : null);
        group.setParentId(normalizedParentId);
        group.setDeviceCount(0);
        group.setCreatedBy(userId);
        groupMapper.insert(group);

        log.info("Device group created: id={}, name={}, type={}", group.getId(), name, group.getType());
        return group;
    }

    public DeviceGroup getGroup(Long id) {
        DeviceGroup group = groupMapper.selectById(id);
        if (group == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "分组不存在");
        }
        return group;
    }

    public IPage<DeviceGroup> listGroups(DeviceGroupQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceGroup> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceGroup> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceGroup::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(DeviceGroup::getName, query.getKeyword());
        }
        wrapper.orderByDesc(DeviceGroup::getCreatedAt);
        return groupMapper.selectPage(page, wrapper);
    }

    public List<DeviceGroup> listAll() {
        Long tenantId = AppContextHolder.getTenantId();
        return groupMapper.selectList(new LambdaQueryWrapper<DeviceGroup>()
                .eq(DeviceGroup::getTenantId, tenantId)
                .orderByAsc(DeviceGroup::getName));
    }

    /**
     * 构建分组树：parentId 为 null 或 0 的为根节点
     */
    public List<DeviceGroupVO> getTree() {
        List<DeviceGroup> all = listAll();
        List<DeviceGroupVO> voList = all.stream()
                .map(DeviceGroupConvert.INSTANCE::toVO)
                .toList();

        Map<Long, List<DeviceGroupVO>> childrenMap = voList.stream()
                .filter(v -> v.getParentId() != null && v.getParentId() > 0)
                .collect(Collectors.groupingBy(DeviceGroupVO::getParentId));

        for (DeviceGroupVO vo : voList) {
            vo.setChildren(childrenMap.getOrDefault(vo.getId(), new ArrayList<>()));
        }

        return voList.stream()
                .filter(v -> v.getParentId() == null || v.getParentId() == 0)
                .toList();
    }

    @Transactional
    public DeviceGroup updateGroup(Long id, String name, String description, String type, String dynamicRule, Long parentId) {
        DeviceGroup group = getGroup(id);
        Long tenantId = AppContextHolder.getTenantId();
        String normalizedType = normalizeGroupType(type != null ? type : group.getType());
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(id, normalizedParentId, tenantId);

        if (name != null) group.setName(name);
        if (description != null) group.setDescription(description);
        group.setType(normalizedType);
        group.setParentId(normalizedParentId);
        group.setDynamicRule(normalizedType.equals("DYNAMIC") ? trimToNull(dynamicRule) : null);
        groupMapper.updateById(group);
        return group;
    }

    @Transactional
    public void deleteGroup(Long id) {
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, id));
        groupMapper.deleteById(id);
        log.info("Device group deleted: id={}", id);
    }

    // ==================== Members ====================

    public List<DeviceGroupMember> listMembers(Long groupId) {
        return memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .orderByDesc(DeviceGroupMember::getCreatedAt));
    }

    public List<DeviceGroupMemberVO> listMemberDetails(Long groupId) {
        List<DeviceGroupMember> members = listMembers(groupId);
        if (members.isEmpty()) {
            return Collections.emptyList();
        }

        Long tenantId = AppContextHolder.getTenantId();
        List<Long> deviceIds = members.stream()
                .map(DeviceGroupMember::getDeviceId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        // 成员列表补齐设备和产品业务字段，前端展示时不再依赖内部主键兜底。
        Map<Long, Device> deviceMap = deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                        .eq(Device::getTenantId, tenantId)
                        .in(Device::getId, deviceIds)
                        .isNull(Device::getDeletedAt))
                .stream()
                .collect(Collectors.toMap(Device::getId, item -> item));

        Map<Long, Product> productMap = productMapper.selectBatchIds(
                        deviceMap.values().stream()
                                .map(Device::getProductId)
                                .filter(Objects::nonNull)
                                .distinct()
                                .toList())
                .stream()
                .collect(Collectors.toMap(Product::getId, item -> item));

        return members.stream().map(member -> {
            DeviceGroupMemberVO vo = DeviceGroupConvert.INSTANCE.toMemberVO(member);
            Device device = deviceMap.get(member.getDeviceId());
            if (device != null) {
                vo.setDeviceName(device.getDeviceName());
                vo.setNickname(device.getNickname());
                vo.setStatus(device.getStatus());
                vo.setOnlineStatus(device.getOnlineStatus());
                Product product = productMap.get(device.getProductId());
                if (product != null) {
                    vo.setProductKey(product.getProductKey());
                    vo.setProductName(product.getName());
                }
            }
            return vo;
        }).toList();
    }

    @Transactional
    public void addDevice(Long groupId, Long deviceId) {
        assertStaticGroupForManualMembership(groupId);
        assertDeviceExists(deviceId);
        Long exists = memberMapper.selectCount(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        if (exists > 0) return;

        DeviceGroupMember member = new DeviceGroupMember();
        member.setGroupId(groupId);
        member.setDeviceId(deviceId);
        member.setCreatedAt(LocalDateTime.now());
        memberMapper.insert(member);
        updateDeviceCount(groupId);
    }

    @Transactional
    public void removeDevice(Long groupId, Long deviceId) {
        assertStaticGroupForManualMembership(groupId);
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        updateDeviceCount(groupId);
    }

    @Transactional
    public void batchAddDevices(Long groupId, List<Long> deviceIds) {
        assertStaticGroupForManualMembership(groupId);
        for (Long deviceId : deviceIds) {
            addDevice(groupId, deviceId);
        }
    }

    @Transactional
    public void batchRemoveDevices(Long groupId, List<Long> deviceIds) {
        assertStaticGroupForManualMembership(groupId);
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .in(DeviceGroupMember::getDeviceId, deviceIds));
        updateDeviceCount(groupId);
    }

    private void assertStaticGroupForManualMembership(Long groupId) {
        DeviceGroup group = getGroup(groupId);
        if (!"STATIC".equalsIgnoreCase(group.getType())) {
            throw new BizException(ResultCode.BAD_REQUEST, "动态分组仅维护规则，不支持手动添加或移除设备");
        }
    }

    private void assertDeviceExists(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectOne(new LambdaQueryWrapper<Device>()
                .eq(Device::getTenantId, tenantId)
                .eq(Device::getId, deviceId)
                .isNull(Device::getDeletedAt)
                .last("limit 1"));
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND, "设备不存在或已被删除");
        }
    }

    private void validateParentGroup(Long currentGroupId, Long parentId, Long tenantId) {
        if (parentId == null) {
            return;
        }
        if (currentGroupId != null && currentGroupId.equals(parentId)) {
            throw new BizException(ResultCode.BAD_REQUEST, "上级分组不能选择自身");
        }

        DeviceGroup parent = groupMapper.selectById(parentId);
        if (parent == null || !Objects.equals(parent.getTenantId(), tenantId)) {
            throw new BizException(ResultCode.BAD_REQUEST, "上级分组不存在");
        }

        if (currentGroupId == null) {
            return;
        }

        // 沿父链向上回溯，避免把当前分组挂到自己的子孙节点下形成环。
        Long cursor = parent.getParentId();
        while (cursor != null && cursor > 0) {
            if (cursor.equals(currentGroupId)) {
                throw new BizException(ResultCode.BAD_REQUEST, "上级分组不能选择当前分组的子孙节点");
            }
            DeviceGroup next = groupMapper.selectById(cursor);
            cursor = next == null ? null : next.getParentId();
        }
    }

    private String normalizeGroupType(String type) {
        if (type == null || type.isBlank()) {
            return "STATIC";
        }
        String normalized = type.trim().toUpperCase();
        if (!"STATIC".equals(normalized) && !"DYNAMIC".equals(normalized)) {
            throw new BizException(ResultCode.BAD_REQUEST, "分组类型仅支持 STATIC 或 DYNAMIC");
        }
        return normalized;
    }

    private Long normalizeParentId(Long parentId) {
        return parentId == null || parentId <= 0 ? null : parentId;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void updateDeviceCount(Long groupId) {
        Long count = memberMapper.selectCount(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId));
        DeviceGroup group = groupMapper.selectById(groupId);
        if (group != null) {
            group.setDeviceCount(count.intValue());
            groupMapper.updateById(group);
        }
    }
}
