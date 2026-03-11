package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceGroupConvert;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupQueryDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupVO;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMapper;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMemberMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private final DeviceGroupMapper groupMapper;
    private final DeviceGroupMemberMapper memberMapper;

    @Transactional
    public DeviceGroup createGroup(String name, String description, String type, String dynamicRule, Long parentId) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        DeviceGroup group = new DeviceGroup();
        group.setTenantId(tenantId);
        group.setName(name);
        group.setDescription(description);
        group.setType(type != null ? type : "STATIC");
        group.setDynamicRule(dynamicRule);
        group.setParentId(parentId);
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
    public DeviceGroup updateGroup(Long id, String name, String description, String dynamicRule) {
        DeviceGroup group = getGroup(id);
        if (name != null) group.setName(name);
        if (description != null) group.setDescription(description);
        if (dynamicRule != null) group.setDynamicRule(dynamicRule);
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

    @Transactional
    public void addDevice(Long groupId, Long deviceId) {
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
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .eq(DeviceGroupMember::getDeviceId, deviceId));
        updateDeviceCount(groupId);
    }

    @Transactional
    public void batchAddDevices(Long groupId, List<Long> deviceIds) {
        for (Long deviceId : deviceIds) {
            addDevice(groupId, deviceId);
        }
    }

    @Transactional
    public void batchRemoveDevices(Long groupId, List<Long> deviceIds) {
        memberMapper.delete(new LambdaQueryWrapper<DeviceGroupMember>()
                .eq(DeviceGroupMember::getGroupId, groupId)
                .in(DeviceGroupMember::getDeviceId, deviceIds));
        updateDeviceCount(groupId);
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
