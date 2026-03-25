package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceGroupConvert;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupDynamicCondition;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupDynamicRule;
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
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private static final String GROUP_TYPE_STATIC = "STATIC";
    private static final String GROUP_TYPE_DYNAMIC = "DYNAMIC";
    private static final String MATCH_MODE_ALL = "ALL";
    private static final String MATCH_MODE_ANY = "ANY";
    private static final String FIELD_PRODUCT_KEY = "productKey";
    private static final String FIELD_DEVICE_NAME = "deviceName";
    private static final String FIELD_NICKNAME = "nickname";
    private static final String FIELD_STATUS = "status";
    private static final String FIELD_ONLINE_STATUS = "onlineStatus";
    private static final String FIELD_TAG = "tag";
    private static final String OPERATOR_EQ = "EQ";
    private static final String OPERATOR_IN = "IN";
    private static final String OPERATOR_CONTAINS = "CONTAINS";
    private static final String OPERATOR_PREFIX = "PREFIX";
    private static final String OPERATOR_HAS_TAG = "HAS_TAG";
    private static final TypeReference<List<String>> TAG_SNAPSHOT_TYPE = new TypeReference<>() { };

    private final DeviceGroupMapper groupMapper;
    private final DeviceGroupMemberMapper memberMapper;
    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public DeviceGroup createGroup(String name, String description, String type, String dynamicRule, Long parentId) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        String normalizedType = normalizeGroupType(type);
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(null, normalizedParentId, tenantId);

        DeviceGroup group = new DeviceGroup();
        group.setTenantId(tenantId);
        group.setName(trimToNull(name));
        group.setDescription(trimToNull(description));
        group.setType(normalizedType);
        group.setDynamicRule(normalizeDynamicRule(normalizedType, dynamicRule));
        group.setParentId(normalizedParentId);
        group.setDeviceCount(0);
        group.setCreatedBy(userId);
        groupMapper.insert(group);

        if (GROUP_TYPE_DYNAMIC.equals(normalizedType)) {
            refreshDynamicGroupMemberships(group);
        }

        log.info("Device group created: id={}, name={}, type={}", group.getId(), group.getName(), group.getType());
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
        String previousType = normalizeGroupType(group.getType());
        String nextType = normalizeGroupType(type != null ? type : group.getType());
        Long normalizedParentId = normalizeParentId(parentId);
        validateParentGroup(id, normalizedParentId, group.getTenantId());

        if (name != null) {
            group.setName(trimToNull(name));
        }
        if (description != null) {
            group.setDescription(trimToNull(description));
        }
        group.setType(nextType);
        if (GROUP_TYPE_DYNAMIC.equals(nextType)) {
            String nextRule = dynamicRule != null ? dynamicRule : group.getDynamicRule();
            group.setDynamicRule(normalizeDynamicRule(nextType, nextRule));
        } else {
            group.setDynamicRule(null);
        }
        group.setParentId(normalizedParentId);
        groupMapper.updateById(group);

        if (GROUP_TYPE_DYNAMIC.equals(nextType)) {
            refreshDynamicGroupMemberships(group);
        } else if (GROUP_TYPE_DYNAMIC.equals(previousType)) {
            clearGroupMembers(group.getId());
        }
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
        getGroup(groupId);
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
    public void rebuildDynamicGroupsForDevice(Long deviceId) {
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            return;
        }

        List<DeviceGroup> dynamicGroups = listDynamicGroups(device.getTenantId());
        if (dynamicGroups.isEmpty()) {
            return;
        }

        DeviceDynamicContext context = buildDynamicContext(device, loadProductKeyMap(List.of(device)));
        List<Long> dynamicGroupIds = dynamicGroups.stream().map(DeviceGroup::getId).toList();
        Set<Long> targetGroupIds = dynamicGroups.stream()
                .filter(group -> matchesDynamicGroup(group, context))
                .map(DeviceGroup::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<DeviceGroupMember> existingMembers = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getDeviceId, deviceId)
                .in(DeviceGroupMember::getGroupId, dynamicGroupIds));
        Set<Long> existingGroupIds = existingMembers.stream()
                .map(DeviceGroupMember::getGroupId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

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
        validateGroupsForCurrentTenant(normalizedGroupIds, true);

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

    public List<Long> filterStaticGroupIds(Collection<Long> groupIds) {
        List<Long> normalizedGroupIds = normalizeIds(groupIds);
        if (normalizedGroupIds.isEmpty()) {
            return List.of();
        }
        Long tenantId = AppContextHolder.getTenantId();
        return groupMapper.selectBatchIds(normalizedGroupIds).stream()
                .filter(Objects::nonNull)
                .filter(group -> tenantId == null || Objects.equals(group.getTenantId(), tenantId))
                .filter(group -> GROUP_TYPE_STATIC.equals(normalizeGroupType(group.getType())))
                .map(DeviceGroup::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
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
        if (parent == null || !Objects.equals(parent.getTenantId(), tenantId)) {
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

    private void validateGroupsForCurrentTenant(Collection<Long> groupIds, boolean staticOnly) {
        if (groupIds == null || groupIds.isEmpty()) {
            return;
        }
        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceGroup> groups = groupMapper.selectBatchIds(groupIds);
        if (groups.size() != groupIds.size()) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some device groups do not exist");
        }
        boolean invalid = groups.stream().anyMatch(group -> {
            if (tenantId != null && !tenantId.equals(group.getTenantId())) {
                return true;
            }
            return staticOnly && !GROUP_TYPE_STATIC.equalsIgnoreCase(group.getType());
        });
        if (invalid) {
            throw new BizException(ResultCode.PARAM_ERROR, staticOnly
                    ? "Only static device groups can be selected here"
                    : "Some device groups are unavailable");
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
                .eq(DeviceGroup::getParentId, parentId));
        children.forEach(child -> {
            collectChildGroupIds(child.getId(), collector);
            collector.add(child.getId());
        });
    }

    private String normalizeGroupType(String type) {
        if (type == null || type.isBlank()) {
            return GROUP_TYPE_STATIC;
        }
        String normalized = type.trim().toUpperCase(Locale.ROOT);
        if (!GROUP_TYPE_STATIC.equals(normalized) && !GROUP_TYPE_DYNAMIC.equals(normalized)) {
            throw new BizException(ResultCode.BAD_REQUEST, "Device group type only supports STATIC or DYNAMIC");
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

    private void refreshDynamicGroupMemberships(DeviceGroup group) {
        if (!GROUP_TYPE_DYNAMIC.equalsIgnoreCase(group.getType())) {
            return;
        }

        DeviceGroupDynamicRule rule = parseDynamicRule(group.getDynamicRule(), true);
        List<Device> devices = deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                .eq(Device::getTenantId, group.getTenantId())
                .isNull(Device::getDeletedAt)
                .orderByAsc(Device::getId));
        if (devices.isEmpty()) {
            clearGroupMembers(group.getId());
            return;
        }

        Map<Long, String> productKeyMap = loadProductKeyMap(devices);
        Set<Long> targetDeviceIds = devices.stream()
                .filter(device -> matchesRule(rule, buildDynamicContext(device, productKeyMap)))
                .map(Device::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        replaceGroupMembers(group.getId(), targetDeviceIds);
    }

    private void replaceGroupMembers(Long groupId, Collection<Long> deviceIds) {
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        List<DeviceGroupMember> existingMembers = memberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId));
        Set<Long> existingDeviceIds = existingMembers.stream()
                .map(DeviceGroupMember::getDeviceId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<Long> targetDeviceIds = new LinkedHashSet<>(normalizedDeviceIds);

        Set<Long> removedDeviceIds = new LinkedHashSet<>(existingDeviceIds);
        removedDeviceIds.removeAll(targetDeviceIds);
        if (!removedDeviceIds.isEmpty()) {
            memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                    .eq(DeviceGroupMember::getGroupId, groupId)
                    .in(DeviceGroupMember::getDeviceId, removedDeviceIds));
        }

        Set<Long> addedDeviceIds = new LinkedHashSet<>(targetDeviceIds);
        addedDeviceIds.removeAll(existingDeviceIds);
        LocalDateTime now = LocalDateTime.now();
        addedDeviceIds.forEach(deviceId -> {
            DeviceGroupMember member = new DeviceGroupMember();
            member.setGroupId(groupId);
            member.setDeviceId(deviceId);
            member.setCreatedAt(now);
            memberMapper.insert(member);
        });

        updateDeviceCount(groupId);
    }

    private void clearGroupMembers(Long groupId) {
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId));
        updateDeviceCount(groupId);
    }

    private boolean matchesDynamicGroup(DeviceGroup group, DeviceDynamicContext context) {
        try {
            return matchesRule(parseDynamicRule(group.getDynamicRule(), false), context);
        } catch (BizException exception) {
            log.warn("Skip invalid dynamic device group rule: groupId={}, message={}", group.getId(), exception.getMessage());
            return false;
        }
    }

    private boolean matchesRule(DeviceGroupDynamicRule rule, DeviceDynamicContext context) {
        if (rule == null || rule.getConditions() == null || rule.getConditions().isEmpty()) {
            return false;
        }

        if (MATCH_MODE_ALL.equalsIgnoreCase(defaultMatchMode(rule.getMatchMode()))) {
            return rule.getConditions().stream().allMatch(condition -> matchesCondition(condition, context));
        }
        return rule.getConditions().stream().anyMatch(condition -> matchesCondition(condition, context));
    }

    private boolean matchesCondition(DeviceGroupDynamicCondition condition, DeviceDynamicContext context) {
        if (condition == null) {
            return false;
        }

        return switch (normalizeField(condition.getField())) {
            case FIELD_PRODUCT_KEY -> matchProductKey(condition, context.productKey());
            case FIELD_DEVICE_NAME -> matchTextValue(condition, context.device().getDeviceName());
            case FIELD_NICKNAME -> matchTextValue(condition, context.device().getNickname());
            case FIELD_STATUS -> matchEquality(condition, enumName(context.device().getStatus()));
            case FIELD_ONLINE_STATUS -> matchEquality(condition, enumName(context.device().getOnlineStatus()));
            case FIELD_TAG -> matchTag(condition, context.tagsByKey());
            default -> false;
        };
    }

    private boolean matchProductKey(DeviceGroupDynamicCondition condition, String productKey) {
        String operator = normalizeOperator(condition.getOperator());
        if (OPERATOR_EQ.equals(operator)) {
            return equalsIgnoreCase(productKey, trimToNull(condition.getValue()));
        }
        if (OPERATOR_IN.equals(operator)) {
            return normalizeTextList(condition.getValues(), condition.getValue()).stream()
                    .anyMatch(candidate -> equalsIgnoreCase(productKey, candidate));
        }
        return false;
    }

    private boolean matchTextValue(DeviceGroupDynamicCondition condition, String actualValue) {
        String expectedValue = trimToNull(condition.getValue());
        String operator = normalizeOperator(condition.getOperator());
        if (expectedValue == null || actualValue == null) {
            return false;
        }
        return switch (operator) {
            case OPERATOR_EQ -> equalsIgnoreCase(actualValue, expectedValue);
            case OPERATOR_CONTAINS -> actualValue.toLowerCase(Locale.ROOT).contains(expectedValue.toLowerCase(Locale.ROOT));
            case OPERATOR_PREFIX -> actualValue.toLowerCase(Locale.ROOT).startsWith(expectedValue.toLowerCase(Locale.ROOT));
            default -> false;
        };
    }

    private boolean matchEquality(DeviceGroupDynamicCondition condition, String actualValue) {
        return OPERATOR_EQ.equals(normalizeOperator(condition.getOperator()))
                && equalsIgnoreCase(actualValue, trimToNull(condition.getValue()));
    }

    private boolean matchTag(DeviceGroupDynamicCondition condition, Map<String, Set<String>> tagsByKey) {
        if (!OPERATOR_HAS_TAG.equals(normalizeOperator(condition.getOperator()))) {
            return false;
        }
        String tagKey = trimToNull(condition.getTagKey());
        if (tagKey == null) {
            return false;
        }

        Set<String> values = tagsByKey.get(tagKey.toLowerCase(Locale.ROOT));
        if (values == null || values.isEmpty()) {
            return false;
        }

        String tagValue = trimToNull(condition.getTagValue());
        if (tagValue == null) {
            return true;
        }
        return values.stream().anyMatch(value -> equalsIgnoreCase(value, tagValue));
    }

    private DeviceGroupDynamicRule parseDynamicRule(String dynamicRule, boolean strict) {
        if (dynamicRule == null || dynamicRule.isBlank()) {
            if (strict) {
                throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group rule cannot be empty");
            }
            return null;
        }

        try {
            DeviceGroupDynamicRule rule = objectMapper.readValue(dynamicRule, DeviceGroupDynamicRule.class);
            validateAndNormalizeRule(rule);
            return rule;
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group rule must be valid JSON");
        }
    }

    private String normalizeDynamicRule(String groupType, String dynamicRule) {
        if (!GROUP_TYPE_DYNAMIC.equals(groupType)) {
            return null;
        }

        DeviceGroupDynamicRule rule = parseDynamicRule(dynamicRule, true);
        try {
            return objectMapper.writeValueAsString(rule);
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "Failed to serialize dynamic group rule");
        }
    }

    private void validateAndNormalizeRule(DeviceGroupDynamicRule rule) {
        if (rule == null) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group rule cannot be empty");
        }

        rule.setMatchMode(defaultMatchMode(rule.getMatchMode()));
        List<DeviceGroupDynamicCondition> conditions = rule.getConditions() == null
                ? List.of()
                : rule.getConditions().stream().filter(Objects::nonNull).toList();
        if (conditions.isEmpty()) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group rule must contain at least one condition");
        }
        conditions.forEach(this::validateAndNormalizeCondition);
        rule.setConditions(conditions);
    }

    private void validateAndNormalizeCondition(DeviceGroupDynamicCondition condition) {
        String field = normalizeField(condition.getField());
        String operator = normalizeOperator(condition.getOperator());
        condition.setField(field);
        condition.setOperator(operator);
        condition.setValue(trimToNull(condition.getValue()));
        condition.setValues(normalizeTextList(condition.getValues(), null));
        condition.setTagKey(trimToNull(condition.getTagKey()));
        condition.setTagValue(trimToNull(condition.getTagValue()));

        switch (field) {
            case FIELD_PRODUCT_KEY -> {
                if (!OPERATOR_EQ.equals(operator) && !OPERATOR_IN.equals(operator)) {
                    throw new BizException(ResultCode.BAD_REQUEST, "productKey only supports EQ or IN");
                }
                if (OPERATOR_EQ.equals(operator) && condition.getValue() == null) {
                    throw new BizException(ResultCode.BAD_REQUEST, "productKey EQ requires value");
                }
                if (OPERATOR_IN.equals(operator) && condition.getValues().isEmpty() && condition.getValue() == null) {
                    throw new BizException(ResultCode.BAD_REQUEST, "productKey IN requires values");
                }
                if (OPERATOR_IN.equals(operator) && condition.getValues().isEmpty() && condition.getValue() != null) {
                    condition.setValues(List.of(condition.getValue()));
                }
            }
            case FIELD_DEVICE_NAME, FIELD_NICKNAME -> {
                if (!Set.of(OPERATOR_EQ, OPERATOR_CONTAINS, OPERATOR_PREFIX).contains(operator)) {
                    throw new BizException(ResultCode.BAD_REQUEST, field + " only supports EQ, CONTAINS or PREFIX");
                }
                if (condition.getValue() == null) {
                    throw new BizException(ResultCode.BAD_REQUEST, field + " requires value");
                }
            }
            case FIELD_STATUS, FIELD_ONLINE_STATUS -> {
                if (!OPERATOR_EQ.equals(operator)) {
                    throw new BizException(ResultCode.BAD_REQUEST, field + " only supports EQ");
                }
                if (condition.getValue() == null) {
                    throw new BizException(ResultCode.BAD_REQUEST, field + " requires value");
                }
            }
            case FIELD_TAG -> {
                if (!OPERATOR_HAS_TAG.equals(operator)) {
                    throw new BizException(ResultCode.BAD_REQUEST, "tag only supports HAS_TAG");
                }
                if (condition.getTagKey() == null) {
                    throw new BizException(ResultCode.BAD_REQUEST, "tag condition requires tagKey");
                }
            }
            default -> throw new BizException(ResultCode.BAD_REQUEST, "Unsupported dynamic group field: " + field);
        }
    }

    private String defaultMatchMode(String matchMode) {
        String normalized = matchMode == null ? MATCH_MODE_ALL : matchMode.trim().toUpperCase(Locale.ROOT);
        if (!MATCH_MODE_ALL.equals(normalized) && !MATCH_MODE_ANY.equals(normalized)) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group matchMode only supports ALL or ANY");
        }
        return normalized;
    }

    private String normalizeField(String field) {
        String normalized = trimToNull(field);
        if (normalized == null) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group field cannot be empty");
        }
        return switch (normalized) {
            case FIELD_PRODUCT_KEY, FIELD_DEVICE_NAME, FIELD_NICKNAME, FIELD_STATUS, FIELD_ONLINE_STATUS, FIELD_TAG -> normalized;
            default -> throw new BizException(ResultCode.BAD_REQUEST, "Unsupported dynamic group field: " + normalized);
        };
    }

    private String normalizeOperator(String operator) {
        String normalized = trimToNull(operator);
        if (normalized == null) {
            throw new BizException(ResultCode.BAD_REQUEST, "Dynamic group operator cannot be empty");
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!Set.of(OPERATOR_EQ, OPERATOR_IN, OPERATOR_CONTAINS, OPERATOR_PREFIX, OPERATOR_HAS_TAG).contains(normalized)) {
            throw new BizException(ResultCode.BAD_REQUEST, "Unsupported dynamic group operator: " + normalized);
        }
        return normalized;
    }

    private DeviceDynamicContext buildDynamicContext(Device device, Map<Long, String> productKeyMap) {
        return new DeviceDynamicContext(
                device,
                productKeyMap.get(device.getProductId()),
                parseTagSnapshot(device.getTags())
        );
    }

    private Map<String, Set<String>> parseTagSnapshot(String rawTags) {
        if (rawTags == null || rawTags.isBlank()) {
            return Map.of();
        }

        try {
            List<String> tags = objectMapper.readValue(rawTags, TAG_SNAPSHOT_TYPE);
            return normalizeTagPairs(tags);
        } catch (Exception exception) {
            return normalizeTagPairs(List.of(rawTags.split(",")));
        }
    }

    private Map<String, Set<String>> normalizeTagPairs(Collection<String> tags) {
        Map<String, Set<String>> result = new LinkedHashMap<>();
        if (tags == null) {
            return result;
        }

        for (String tag : tags) {
            String normalizedTag = trimToNull(tag);
            if (normalizedTag == null) {
                continue;
            }
            int separatorIndex = normalizedTag.indexOf(':');
            if (separatorIndex <= 0) {
                continue;
            }
            String tagKey = normalizedTag.substring(0, separatorIndex).trim().toLowerCase(Locale.ROOT);
            String tagValue = normalizedTag.substring(separatorIndex + 1).trim();
            if (tagKey.isEmpty() || tagValue.isEmpty()) {
                continue;
            }
            result.computeIfAbsent(tagKey, ignored -> new LinkedHashSet<>()).add(tagValue);
        }
        return result;
    }

    private Map<Long, String> loadProductKeyMap(Collection<Device> devices) {
        if (devices == null || devices.isEmpty()) {
            return Map.of();
        }

        List<Long> productIds = devices.stream()
                .map(Device::getProductId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (productIds.isEmpty()) {
            return Map.of();
        }

        return productMapper.selectBatchIds(productIds).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Product::getId, Product::getProductKey));
    }

    private List<DeviceGroup> listDynamicGroups(Long tenantId) {
        if (tenantId == null) {
            return List.of();
        }
        return groupMapper.selectList(new LambdaQueryWrapper<DeviceGroup>()
                .eq(DeviceGroup::getTenantId, tenantId)
                .eq(DeviceGroup::getType, GROUP_TYPE_DYNAMIC)
                .orderByAsc(DeviceGroup::getId));
    }

    private List<String> normalizeTextList(Collection<String> values, String fallbackValue) {
        List<String> normalizedValues = values == null
                ? new ArrayList<>()
                : values.stream()
                .map(this::trimToNull)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
        String fallback = trimToNull(fallbackValue);
        if (fallback != null && !normalizedValues.contains(fallback)) {
            normalizedValues.add(fallback);
        }
        return normalizedValues;
    }

    private String enumName(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
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

    /**
     * Cache product/tag data per device mutation so dynamic rule evaluation stays deterministic
     * without repeated mapper calls inside each condition branch.
     */
    private record DeviceDynamicContext(Device device, String productKey, Map<String, Set<String>> tagsByKey) {
    }
}
