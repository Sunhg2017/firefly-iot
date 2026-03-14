package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceTagConvert;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagBindingVO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagQueryDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.entity.DeviceTagBinding;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTagBindingMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTagMapper;
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
public class DeviceTagService {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final DeviceTagMapper tagMapper;
    private final DeviceTagBindingMapper bindingMapper;
    private final DeviceMapper deviceMapper;
    private final DeviceGroupService deviceGroupService;

    @Transactional
    public DeviceTag createTag(String tagKey, String tagValue, String color, String description) {
        Long tenantId = AppContextHolder.getTenantId();

        Long exists = tagMapper.selectCount(new LambdaQueryWrapper<DeviceTag>()
                .eq(DeviceTag::getTenantId, tenantId)
                .eq(DeviceTag::getTagKey, tagKey)
                .eq(DeviceTag::getTagValue, tagValue));
        if (exists > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "Tag already exists");
        }

        DeviceTag tag = new DeviceTag();
        tag.setTenantId(tenantId);
        tag.setTagKey(tagKey);
        tag.setTagValue(tagValue);
        tag.setColor(color != null ? color : "#1890ff");
        tag.setDescription(description);
        tag.setDeviceCount(0);
        tagMapper.insert(tag);
        return tag;
    }

    public IPage<DeviceTag> listTags(DeviceTagQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceTag> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceTag> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceTag::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(DeviceTag::getTagKey, query.getKeyword()).or().like(DeviceTag::getTagValue, query.getKeyword()));
        }
        wrapper.orderByDesc(DeviceTag::getDeviceCount);
        return tagMapper.selectPage(page, wrapper);
    }

    public List<DeviceTag> listAll() {
        Long tenantId = AppContextHolder.getTenantId();
        return tagMapper.selectList(new LambdaQueryWrapper<DeviceTag>()
                .eq(DeviceTag::getTenantId, tenantId)
                .orderByAsc(DeviceTag::getTagKey)
                .orderByAsc(DeviceTag::getTagValue));
    }

    @Transactional
    public DeviceTag updateTag(Long id, String tagValue, String color, String description) {
        DeviceTag tag = getTagOrThrow(id);
        if (tagValue != null) {
            tag.setTagValue(tagValue);
        }
        if (color != null) {
            tag.setColor(color);
        }
        if (description != null) {
            tag.setDescription(description);
        }
        tagMapper.updateById(tag);

        // Keep historical device snapshots aligned with the latest tag label/color changes.
        listDeviceIdsByTag(id).forEach(this::refreshDeviceTagSnapshot);
        return tag;
    }

    @Transactional
    public void deleteTag(Long id) {
        DeviceTag tag = getTagOrThrow(id);
        List<Long> deviceIds = listDeviceIdsByTag(tag.getId());
        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>().eq(DeviceTagBinding::getTagId, tag.getId()));
        tagMapper.deleteById(tag.getId());
        deviceIds.forEach(this::refreshDeviceTagSnapshot);
    }

    public List<DeviceTagBindingVO> listBindings(Long tagId) {
        DeviceTag tag = getTagOrThrow(tagId);
        List<DeviceTagBinding> bindings = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tag.getId())
                .orderByDesc(DeviceTagBinding::getCreatedAt));
        if (bindings.isEmpty()) {
            return List.of();
        }

        Map<Long, DeviceBasicVO> deviceMap = deviceMapper.selectBasicByIdsIgnoreTenant(
                        bindings.stream().map(DeviceTagBinding::getDeviceId).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(DeviceBasicVO::getId, item -> item));

        return bindings.stream()
                .map(binding -> toBindingVO(binding, deviceMap.get(binding.getDeviceId())))
                .toList();
    }

    public List<DeviceTag> getDeviceTags(Long deviceId) {
        getDeviceOrThrow(deviceId);
        List<DeviceTagBinding> bindings = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getDeviceId, deviceId)
                .orderByAsc(DeviceTagBinding::getCreatedAt));
        if (bindings.isEmpty()) {
            return List.of();
        }

        Map<Long, DeviceTag> tagMap = tagMapper.selectBatchIds(
                        bindings.stream().map(DeviceTagBinding::getTagId).distinct().toList()
                ).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(DeviceTag::getId, item -> item));

        List<DeviceTag> result = new ArrayList<>();
        bindings.forEach(binding -> {
            DeviceTag tag = tagMap.get(binding.getTagId());
            if (tag != null) {
                result.add(tag);
            }
        });
        return result;
    }

    public Map<Long, List<DeviceTag>> getDeviceTagMap(Collection<Long> deviceIds) {
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<DeviceTagBinding> bindings = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .in(DeviceTagBinding::getDeviceId, normalizedDeviceIds)
                .orderByAsc(DeviceTagBinding::getCreatedAt));
        Map<Long, List<DeviceTag>> result = normalizedDeviceIds.stream()
                .collect(Collectors.toMap(id -> id, id -> new ArrayList<>(), (left, right) -> left, LinkedHashMap::new));
        if (bindings.isEmpty()) {
            return result;
        }

        Map<Long, DeviceTag> tagMap = tagMapper.selectBatchIds(
                        bindings.stream().map(DeviceTagBinding::getTagId).distinct().toList()
                ).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(DeviceTag::getId, item -> item));

        bindings.forEach(binding -> {
            DeviceTag tag = tagMap.get(binding.getTagId());
            if (tag != null) {
                result.computeIfAbsent(binding.getDeviceId(), ignored -> new ArrayList<>()).add(tag);
            }
        });
        return result;
    }

    @Transactional
    public void bindTag(Long tagId, Long deviceId) {
        DeviceTag tag = getTagOrThrow(tagId);
        getDeviceOrThrow(deviceId);
        Long exists = bindingMapper.selectCount(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tag.getId())
                .eq(DeviceTagBinding::getDeviceId, deviceId));
        if (exists > 0) {
            return;
        }

        DeviceTagBinding binding = new DeviceTagBinding();
        binding.setTagId(tag.getId());
        binding.setDeviceId(deviceId);
        binding.setCreatedAt(LocalDateTime.now());
        bindingMapper.insert(binding);

        updateDeviceCount(tag.getId());
        refreshDeviceTagSnapshot(deviceId);
        deviceGroupService.rebuildDynamicGroupsForDevice(deviceId);
    }

    @Transactional
    public void unbindTag(Long tagId, Long deviceId) {
        DeviceTag tag = getTagOrThrow(tagId);
        getDeviceOrThrow(deviceId);
        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tag.getId())
                .eq(DeviceTagBinding::getDeviceId, deviceId));
        updateDeviceCount(tag.getId());
        refreshDeviceTagSnapshot(deviceId);
        deviceGroupService.rebuildDynamicGroupsForDevice(deviceId);
    }

    @Transactional
    public void batchBindTag(Long tagId, List<Long> deviceIds) {
        DeviceTag tag = getTagOrThrow(tagId);
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return;
        }

        validateDevicesForCurrentTenant(normalizedDeviceIds);
        Set<Long> existingDeviceIds = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                        .eq(DeviceTagBinding::getTagId, tag.getId())
                        .in(DeviceTagBinding::getDeviceId, normalizedDeviceIds))
                .stream()
                .map(DeviceTagBinding::getDeviceId)
                .collect(Collectors.toSet());

        LocalDateTime now = LocalDateTime.now();
        normalizedDeviceIds.stream()
                .filter(deviceId -> !existingDeviceIds.contains(deviceId))
                .forEach(deviceId -> {
                    DeviceTagBinding binding = new DeviceTagBinding();
                    binding.setTagId(tag.getId());
                    binding.setDeviceId(deviceId);
                    binding.setCreatedAt(now);
                    bindingMapper.insert(binding);
                });

        updateDeviceCount(tag.getId());
        normalizedDeviceIds.forEach(this::refreshDeviceTagSnapshot);
        normalizedDeviceIds.forEach(deviceGroupService::rebuildDynamicGroupsForDevice);
    }

    @Transactional
    public void batchUnbindTag(Long tagId, List<Long> deviceIds) {
        DeviceTag tag = getTagOrThrow(tagId);
        List<Long> normalizedDeviceIds = normalizeIds(deviceIds);
        if (normalizedDeviceIds.isEmpty()) {
            return;
        }

        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tag.getId())
                .in(DeviceTagBinding::getDeviceId, normalizedDeviceIds));
        updateDeviceCount(tag.getId());
        normalizedDeviceIds.forEach(this::refreshDeviceTagSnapshot);
        normalizedDeviceIds.forEach(deviceGroupService::rebuildDynamicGroupsForDevice);
    }

    @Transactional
    public void syncDeviceTags(Long deviceId, Collection<Long> tagIds) {
        getDeviceOrThrow(deviceId);
        List<Long> normalizedTagIds = normalizeIds(tagIds);
        validateTagsForCurrentTenant(normalizedTagIds);

        List<DeviceTagBinding> existingBindings = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getDeviceId, deviceId));
        Set<Long> existingTagIds = existingBindings.stream()
                .map(DeviceTagBinding::getTagId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<Long> targetTagIds = new LinkedHashSet<>(normalizedTagIds);

        Set<Long> removedTagIds = new LinkedHashSet<>(existingTagIds);
        removedTagIds.removeAll(targetTagIds);
        if (!removedTagIds.isEmpty()) {
            bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                    .eq(DeviceTagBinding::getDeviceId, deviceId)
                    .in(DeviceTagBinding::getTagId, removedTagIds));
        }

        Set<Long> addedTagIds = new LinkedHashSet<>(targetTagIds);
        addedTagIds.removeAll(existingTagIds);
        LocalDateTime now = LocalDateTime.now();
        addedTagIds.forEach(tagId -> {
            DeviceTagBinding binding = new DeviceTagBinding();
            binding.setTagId(tagId);
            binding.setDeviceId(deviceId);
            binding.setCreatedAt(now);
            bindingMapper.insert(binding);
        });

        Set<Long> affectedTagIds = new LinkedHashSet<>(removedTagIds);
        affectedTagIds.addAll(addedTagIds);
        affectedTagIds.forEach(this::updateDeviceCount);
        refreshDeviceTagSnapshot(deviceId);
        deviceGroupService.rebuildDynamicGroupsForDevice(deviceId);
    }

    @Transactional
    public void removeDeviceBindings(Long deviceId) {
        List<DeviceTagBinding> bindings = bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getDeviceId, deviceId));
        if (bindings.isEmpty()) {
            return;
        }

        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getDeviceId, deviceId));
        bindings.stream()
                .map(DeviceTagBinding::getTagId)
                .distinct()
                .forEach(this::updateDeviceCount);
        refreshDeviceTagSnapshot(deviceId);
        deviceGroupService.rebuildDynamicGroupsForDevice(deviceId);
    }

    private void refreshDeviceTagSnapshot(Long deviceId) {
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            return;
        }

        List<String> snapshot = getDeviceTags(deviceId).stream()
                .map(tag -> tag.getTagKey() + ":" + tag.getTagValue())
                .toList();
        try {
            device.setTags(OBJECT_MAPPER.writeValueAsString(snapshot));
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "Failed to serialize device tag snapshot");
        }
        deviceMapper.updateById(device);
    }

    private void updateDeviceCount(Long tagId) {
        Long count = bindingMapper.selectCount(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId));
        DeviceTag tag = tagMapper.selectById(tagId);
        if (tag != null) {
            tag.setDeviceCount(count == null ? 0 : count.intValue());
            tagMapper.updateById(tag);
        }
    }

    private DeviceTagBindingVO toBindingVO(DeviceTagBinding binding, DeviceBasicVO device) {
        DeviceTagBindingVO vo = DeviceTagConvert.INSTANCE.toBindingVO(binding);
        if (device != null) {
            vo.setDeviceName(device.getDeviceName());
            vo.setNickname(device.getNickname());
            vo.setProductId(device.getProductId());
            vo.setProductName(device.getProductName());
        }
        return vo;
    }

    private DeviceTag getTagOrThrow(Long tagId) {
        Long tenantId = AppContextHolder.getTenantId();
        DeviceTag tag = tagMapper.selectById(tagId);
        if (tag == null || (tenantId != null && !tenantId.equals(tag.getTenantId()))) {
            throw new BizException(ResultCode.PARAM_ERROR, "Tag not found");
        }
        return tag;
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

    private void validateTagsForCurrentTenant(Collection<Long> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return;
        }

        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceTag> tags = tagMapper.selectBatchIds(tagIds);
        if (tags.size() != tagIds.size()) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some tags do not exist");
        }
        boolean invalidTenant = tags.stream()
                .anyMatch(tag -> tenantId != null && !tenantId.equals(tag.getTenantId()));
        if (invalidTenant) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some tags do not belong to current tenant");
        }
    }

    private void validateDevicesForCurrentTenant(Collection<Long> deviceIds) {
        if (deviceIds == null || deviceIds.isEmpty()) {
            return;
        }

        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceBasicVO> devices = deviceMapper.selectBasicByIdsIgnoreTenant(new ArrayList<>(deviceIds));
        if (devices.size() != deviceIds.size()) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        boolean invalidTenant = devices.stream()
                .anyMatch(device -> tenantId != null && !tenantId.equals(device.getTenantId()));
        if (invalidTenant) {
            throw new BizException(ResultCode.PARAM_ERROR, "Some devices do not belong to current tenant");
        }
    }

    private List<Long> listDeviceIdsByTag(Long tagId) {
        return bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                        .eq(DeviceTagBinding::getTagId, tagId))
                .stream()
                .map(DeviceTagBinding::getDeviceId)
                .distinct()
                .toList();
    }

    private List<Long> normalizeIds(Collection<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        return ids.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }
}
