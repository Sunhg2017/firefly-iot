package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagQueryDTO;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.entity.DeviceTagBinding;
import com.songhg.firefly.iot.device.mapper.DeviceTagBindingMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTagMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceTagService {

    private final DeviceTagMapper tagMapper;
    private final DeviceTagBindingMapper bindingMapper;

    @Transactional
    public DeviceTag createTag(String tagKey, String tagValue, String color, String description) {
        Long tenantId = TenantContextHolder.getTenantId();

        Long exists = tagMapper.selectCount(new LambdaQueryWrapper<DeviceTag>()
                .eq(DeviceTag::getTenantId, tenantId)
                .eq(DeviceTag::getTagKey, tagKey)
                .eq(DeviceTag::getTagValue, tagValue));
        if (exists > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "标签已存在");
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
        Long tenantId = TenantContextHolder.getTenantId();
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
        Long tenantId = TenantContextHolder.getTenantId();
        return tagMapper.selectList(new LambdaQueryWrapper<DeviceTag>()
                .eq(DeviceTag::getTenantId, tenantId)
                .orderByAsc(DeviceTag::getTagKey));
    }

    @Transactional
    public DeviceTag updateTag(Long id, String tagValue, String color, String description) {
        DeviceTag tag = tagMapper.selectById(id);
        if (tag == null) throw new BizException(ResultCode.PARAM_ERROR, "标签不存在");
        if (tagValue != null) tag.setTagValue(tagValue);
        if (color != null) tag.setColor(color);
        if (description != null) tag.setDescription(description);
        tagMapper.updateById(tag);
        return tag;
    }

    @Transactional
    public void deleteTag(Long id) {
        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>().eq(DeviceTagBinding::getTagId, id));
        tagMapper.deleteById(id);
    }

    // ==================== Bindings ====================

    public List<DeviceTagBinding> listBindings(Long tagId) {
        return bindingMapper.selectList(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId).orderByDesc(DeviceTagBinding::getCreatedAt));
    }

    public List<DeviceTag> getDeviceTags(Long deviceId) {
        List<DeviceTagBinding> bindings = bindingMapper.selectList(
                new LambdaQueryWrapper<DeviceTagBinding>().eq(DeviceTagBinding::getDeviceId, deviceId));
        if (bindings.isEmpty()) return List.of();
        List<Long> tagIds = bindings.stream().map(DeviceTagBinding::getTagId).collect(Collectors.toList());
        return tagMapper.selectBatchIds(tagIds);
    }

    @Transactional
    public void bindTag(Long tagId, Long deviceId) {
        Long exists = bindingMapper.selectCount(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId).eq(DeviceTagBinding::getDeviceId, deviceId));
        if (exists > 0) return;
        DeviceTagBinding b = new DeviceTagBinding();
        b.setTagId(tagId);
        b.setDeviceId(deviceId);
        b.setCreatedAt(LocalDateTime.now());
        bindingMapper.insert(b);
        updateDeviceCount(tagId);
    }

    @Transactional
    public void unbindTag(Long tagId, Long deviceId) {
        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId).eq(DeviceTagBinding::getDeviceId, deviceId));
        updateDeviceCount(tagId);
    }

    @Transactional
    public void batchBindTag(Long tagId, List<Long> deviceIds) {
        for (Long deviceId : deviceIds) bindTag(tagId, deviceId);
    }

    @Transactional
    public void batchUnbindTag(Long tagId, List<Long> deviceIds) {
        bindingMapper.delete(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId).in(DeviceTagBinding::getDeviceId, deviceIds));
        updateDeviceCount(tagId);
    }

    private void updateDeviceCount(Long tagId) {
        Long count = bindingMapper.selectCount(new LambdaQueryWrapper<DeviceTagBinding>()
                .eq(DeviceTagBinding::getTagId, tagId));
        DeviceTag tag = tagMapper.selectById(tagId);
        if (tag != null) { tag.setDeviceCount(count.intValue()); tagMapper.updateById(tag); }
    }
}
