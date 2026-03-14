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
import com.songhg.firefly.iot.device.mapper.DeviceGroupMapper;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMemberMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private static final String GROUP_TYPE_STATIC = "STATIC";

    private final DeviceGroupMapper groupMapper;
    private final DeviceGroupMemberMapper memberMapper;
    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;

    @Transactional
    public DeviceGroup createGroup(String name, String description, String type, String dynamicRule, Long parentId) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(null, normalizedParentId, tenantId);

        DeviceGroup group = new DeviceGroup();
        group.setTenantId(tenantId);
        group.setName(trimToNull(name));
        group.setDescription(trimToNull(description));
        group.setType(normalizeGroupType(type));
        group.setDynamicRule(null);
        group.setParentId(normalizedParentId);
        group.setDeviceCount(0);
        group.setCreatedBy(userId);
        groupMapper.insert(group);

        log.info("Device group created: id={}, name={}", group.getId(), group.getName());
        return group;
    }

    public DeviceGroup getGroup(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        DeviceGroup group = groupMapper.selectById(id);
        if (group == null || (tenantId != null && !tenantId.equals(group.getTenantId()))) {
            throw new BizException(ResultCode.PARAM_ERROR, "Device group not found");
        }
        return group;
    }

    public IPage<DeviceGroup> listGroups(DeviceGroupQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceGroup> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceGroup> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceGroup::getTenantId, tenantId);
        wrapper.eq(DeviceGroup::getType, GROUP_TYPE_STATIC);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(DeviceGroup::getName, query.getKeyword());
        }
        wrapper.orderByAsc(DeviceGroup::getParentId).orderByAsc(DeviceGroup::getName);
        return groupMapper.selectPage(page, wrapper);
    }

    public List<DeviceGroup> listAll() {
        Long tenantId = AppContextHolder.getTenantId();
        return groupMapper.selectList(new LambdaQueryWrapper<DeviceGroup>()
                .eq(DeviceGroup::getTenantId, tenantId)
                .eq(DeviceGroup::getType, GROUP_TYPE_STATIC)
                .orderByAsc(DeviceGroup::getParentId)
                .orderByAsc(DeviceGroup::getName));
    }

    public List<DeviceGroupVO> getTree() {
        List<DeviceGroupVO> voList = listAll().stream()
                .map(DeviceGroupConvert.INSTANCE::toVO)
                .toList();
        Map<Long, List<DeviceGroupVO>> childrenMap = voList.stream()
                .filter(item -> item.getParentId() != null && item.getParentId() > 0)
                .collect(Collectors.groupingBy(DeviceGroupVO::getParentId, LinkedHashMap::new, Collectors.toList()));
        voList.forEach(item -> item.setChildren(childrenMap.getOrDefault(item.getId(), new ArrayList<>())));
        return voList.stream()
                .filter(item -> item.getParentId() == null || item.getParentId() <= 0)
                .toList();
    }

    @Transactional
    public DeviceGroup updateGroup(Long id, String name, String description, String type, String dynamicRule, Long parentId) {
        DeviceGroup group = getGroup(id);
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(id, normalizedParentId, AppContextHolder.getTenantId());

        if (name != null) {
            group.setName(trimToNull(name));
        }
        if (description != null) {
            group.setDescription(trimToNull(description));
        }
        group.setType(normalizeGroupType(type != null ? type : group.getType()));
        group.setDynamicRule(null);
        group.setParentId(normalizedParentId);
        groupMapper.updateById(group);
        return group;
    }

    @Transactional
    public void deleteGroup(Long id) {
        DeviceGroup group = getGroup(id);
        List<Long> groupIds = new ArrayList<>();
        collectChildGroupIds(group.getId(), groupIds);
        groupIds.add(group.getId());

        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .in(DeviceGroupMember::getGroupId, groupIds));
        groupMapper.deleteBatchIds(groupIds);
        log.info("Device groups deleted: ids={}", groupIds);
    }

    public List<DeviceGroupMember> listMembers(Long groupId) {
        getGroup(groupId);
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

    public List<DeviceGroup> getDeviceGroups(Long deviceId) {
        getDeviceOrThrow(deviceId);
        List<DeviceGroupMember> members = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getDeviceId, deviceId)
                .orderByAsc(DeviceGroupMember::getCreatedAt));
        if (members.isEmpty()) {
            return List.of();
        }

        Map<Long, DeviceGroup> groupMap = groupMapper.selectBatchIds(
                        members.stream().map(DeviceGroupMember::getGroupId).distinct().toList()
                ).stream()
                .filter(Objects::nonNull)
                .filter(group -> GROUP_TYPE_STATIC.equalsIgnoreCase(group.getType()))
                .collect(Collectors.toMap(DeviceGroup::getId, item -> item));

        List<DeviceGroup> result = new ArrayList<>();
        members.forEach(member -> {
            DeviceGroup group = groupMap.get(member.getGroupId());
            if (group != null) {
                result.add(group);
            }
        });
        return result;
    }

    public Map<Long, List<DeviceGroup>> getDeviceGroupMap(Collection<Long> deviceIds) {
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<DeviceGroupMember> members = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .in(DeviceGroupMember::getDeviceId, normalizedDeviceIds)
                .orderByAsc(DeviceGroupMember::getCreatedAt));
        Map<Long, List<DeviceGroup>> result = normalizedDeviceIds.stream()
                .collect(Collectors.toMap(id -> id, id -> new ArrayList<>(), (left, right) -> left, LinkedHashMap::new));
        if (members.isEmpty()) {
            return result;
        }

        Map<Long, DeviceGroup> groupMap = groupMapper.selectBatchIds(
                        members.stream().map(DeviceGroupMember::getGroupId).distinct().toList()
                ).stream()
                .filter(Objects::nonNull)
                .filter(group -> GROUP_TYPE_STATIC.equalsIgnoreCase(group.getType()))
                .collect(Collectors.toMap(DeviceGroup::getId, item -> item));

        members.forEach(member -> {
            DeviceGroup group = groupMap.get(member.getGroupId());
            if (group != null) {
                result.computeIfAbsent(member.getDeviceId(), ignored -> new ArrayList<>()).add(group);
            }
        });
        return result;
    }

    public List<Long> listDeviceIdsByGroup(Long groupId) {
        assertStaticGroup(groupId);
        return memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                        .eq(DeviceGroupMember::getGroupId, groupId)
                        .orderByAsc(DeviceGroupMember::getCreatedAt))
                .stream()
                .map(DeviceGroupMember::getDeviceId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    @Transactional
    public void addDevice(Long groupId, Long deviceId) {
        assertStaticGroup(groupId);
        getDeviceOrThrow(deviceId);
        Long exists = memberMapper.selectCount(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        if (exists != null && exists > 0) {
            return;
        }

        DeviceGroupMember member = new DeviceGroupMember();
        member.setGroupId(groupId);
        member.setDeviceId(deviceId);
        member.setCreatedAt(LocalDateTime.now());
        memberMapper.insert(member);
        updateDeviceCount(groupId);
    }

    @Transactional
    public void removeDevice(Long groupId, Long deviceId) {
        assertStaticGroup(groupId);
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        updateDeviceCount(groupId);
    }

    @Transactional
    public void batchAddDevices(Long groupId, List<Long> deviceIds) {
        assertStaticGroup(groupId);
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return;
        }

        validateDevicesForCurrentTenant(normalizedDeviceIds);
        Set<Long> existingIds = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                        .eq(DeviceGroupMember::getGroupId, groupId)
                        .in(DeviceGroupMember::getDeviceId, normalizedDeviceIds))
                .stream()
                .map(DeviceGroupMember::getDeviceId)
                .collect(Collectors.toSet());

        LocalDateTime now = LocalDateTime.now();
        normalizedDeviceIds.stream()
                .filter(deviceId -> !existingIds.contains(deviceId))
                .forEach(deviceId -> {
                    DeviceGroupMember member = new DeviceGroupMember();
                    member.setGroupId(groupId);
                    member.setDeviceId(deviceId);
                    member.setCreatedAt(now);
                    memberMapper.insert(member);
                });
        updateDeviceCount(groupId);
    }

    @Transactional
    public void batchRemoveDevices(Long groupId, List<Long> deviceIds) {
        assertStaticGroup(groupId);
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return;
        }
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .in(DeviceGroupMember::getDeviceId, normalizedDeviceIds));
        updateDeviceCount(groupId);
    }

    @Transactional
    public void syncDeviceGroups(Long deviceId, Collection<Long> groupIds) {
        getDeviceOrThrow(deviceId);
        List<Long> normalizedGroupIds = normalizeIds(groupIds);
        validateGroupsForCurrentTenant(normalizedGroupIds);

        List<DeviceGroupMember> existingMembers = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        Set<Long> existingGroupIds = existingMembers.stream()
                .map(DeviceGroupMember::getGroupId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<Long> targetGroupIds = new LinkedHashSet<>(normalizedGroupIds);

        Set<Long> removedGroupIds = new LinkedHashSet<>(existingGroupIds);
        removedGroupIds.removeAll(targetGroupIds);
        if (!removedGroupIds.isEmpty()) {
            memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                    .eq(DeviceGroupMember::getDeviceId, deviceId)
                    .in(DeviceGroupMember::getGroupId, removedGroupIds));
        }

        Set<Long> addedGroupIds = new LinkedHashSet<>(targetGroupIds);
        addedGroupIds.removeAll(existingGroupIds);
        LocalDateTime now = LocalDateTime.now();
        addedGroupIds.forEach(groupId -> {
            DeviceGroupMember member = new DeviceGroupMember();
            member.setGroupId(groupId);
            member.setDeviceId(deviceId);
            member.setCreatedAt(now);
            memberMapper.insert(member);
        });

        Set<Long> affectedGroupIds = new LinkedHashSet<>(removedGroupIds);
        affectedGroupIds.addAll(addedGroupIds);
        affectedGroupIds.forEach(this::updateDeviceCount);
    }

    @Transactional
    public void removeDeviceMemberships(Long deviceId) {
        List<DeviceGroupMember> members = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        if (members.isEmpty()) {
            return;
        }
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        members.stream()
                .map(DeviceGroupMember::getGroupId)
                .distinct()
                .forEach(this::updateDeviceCount);
    }

    private void assertStaticGroup(Long groupId) {
        DeviceGroup group = getGroup(groupId);
        if (!GROUP_TYPE_STATIC.equalsIgnoreCase(group.getType())) {
            throw new BizException(ResultCode.BAD_REQUEST, "Only static device groups are supported");
        }
    }

    private Device getDeviceOrThrow(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        if (tenantId != null && device.getTenantId() != null && !tenantId.equals(device.getTenantId())) {
            throw new BizException(ResultCode.PARAM_ERROR, "Device does not belong to current tenant");
        }
        return device;
    }

    private void validateParentGroup(Long currentGroupId, Long parentId, Long tenantId) {
        if (parentId == null) {
            return;
        }
        if (currentGroupId != null && currentGroupId.equals(parentId)) {
            throw new BizException(ResultCode.BAD_REQUEST, "Parent group cannot be self");
        }

        DeviceGroup parent = groupMapper.selectById(parentId);
        if (parent == null || !Objects.equals(parent.getTenantId(), tenantId) || !GROUP_TYPE_STATIC.equalsIgnoreCase(parent.getType())) {
            throw new BizException(ResultCode.BAD_REQUEST, "Parent group does not exist");
        }

        if (currentGroupId == null) {
            return;
        }

        Long cursor = parent.getParentId();
        while (cursor != null && cursor > 0) {
            if (cursor.equals(currentGroupId)) {
                throw new BizException(ResultCode.BAD_REQUEST, "Parent group cannot be descendant of current group");
            }
            DeviceGroup next = groupMapper.selectById(cursor);
            cursor = next == null ? null : next.getParentId();
        }
    }

    private void validateGroupsForCurrentTenant(Collection<Long> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return;
        }
        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceGroup> groups = groupMapper.selectBatchIds(groupIds);
        if (groups.size() != groupIds.size()) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some device groups do not exist");
        }
        boolean invalid = groups.stream().anyMatch(group ->
                tenantId != null && (!tenantId.equals(group.getTenantId()) || !GROUP_TYPE_STATIC.equalsIgnoreCase(group.getType())));
        if (invalid) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some device groups are unavailable");
        }
    }

    private void validateDevicesForCurrentTenant(Collection<Long> deviceIds) {
        if (deviceIds == null || deviceIds.isEmpty()) {
            return;
        }
        Long tenantId = AppContextHolder.getTenantId();
        List<Device> devices = deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                .eq(Device::getTenantId, tenantId)
                .in(Device::getId, deviceIds)
                .isNull(Device::getDeletedAt));
        if (devices.size() != deviceIds.size()) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
    }

    private void collectChildGroupIds(Long parentId, List<Long> collector) {
        List<DeviceGroup> children = groupMapper.selectList(new LambdaQueryWrapper<DeviceGroup>()
                .eq(DeviceGroup::getTenantId, AppContextHolder.getTenantId())
                .eq(DeviceGroup::getParentId, parentId)
                .eq(DeviceGroup::getType, GROUP_TYPE_STATIC));
        children.forEach(child -> {
            collectChildGroupIds(child.getId(), collector);
            collector.add(child.getId());
        });
    }

    private String normalizeGroupType(String type) {
        if (type == null || type.isBlank()) {
            return GROUP_TYPE_STATIC;
        }
        String normalized = type.trim().toUpperCase();
        if (!GROUP_TYPE_STATIC.equals(normalized)) {
            throw new BizException(ResultCode.BAD_REQUEST, "Only static device groups are currently enabled");
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
            group.setDeviceCount(count == null ? 0 : count.intValue());
            groupMapper.updateById(group);
        }
    }

    private List<Long> normalizeIds(Collection<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        return ids.stream().filter(Objects::nonNull).distinct().toList();
    }
}
