package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagBindingVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.entity.DeviceTagBinding;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTagBindingMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTagMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceTagServiceTest {

    private final DeviceTagMapper tagMapper = org.mockito.Mockito.mock(DeviceTagMapper.class);
    private final DeviceTagBindingMapper bindingMapper = org.mockito.Mockito.mock(DeviceTagBindingMapper.class);
    private final DeviceMapper deviceMapper = org.mockito.Mockito.mock(DeviceMapper.class);
    private final DeviceTagService service = new DeviceTagService(tagMapper, bindingMapper, deviceMapper);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void syncDeviceTagsShouldReplaceBindingsAndRefreshDeviceSnapshot() {
        AppContextHolder.setTenantId(1L);

        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);

        DeviceTag oldTag = buildTag(1L, "region", "cn");
        DeviceTag newTag1 = buildTag(2L, "site", "west");
        DeviceTag newTag2 = buildTag(3L, "level", "critical");

        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(device);
        when(bindingMapper.selectList(any()))
                .thenReturn(List.of(buildBinding(100L, 1L, 10L)))
                .thenReturn(List.of(buildBinding(101L, 2L, 10L), buildBinding(102L, 3L, 10L)));
        when(tagMapper.selectBatchIds(List.of(2L, 3L))).thenReturn(List.of(newTag1, newTag2));
        when(bindingMapper.selectCount(any())).thenReturn(0L);
        when(tagMapper.selectById(anyLong())).thenAnswer(invocation -> {
            Long id = invocation.getArgument(0);
            if (id.equals(1L)) {
                return oldTag;
            }
            if (id.equals(2L)) {
                return newTag1;
            }
            return newTag2;
        });

        service.syncDeviceTags(10L, List.of(2L, 3L));

        verify(bindingMapper, times(1)).delete(any());
        verify(bindingMapper, times(2)).insert(any(DeviceTagBinding.class));

        ArgumentCaptor<Device> deviceCaptor = ArgumentCaptor.forClass(Device.class);
        verify(deviceMapper).updateById(deviceCaptor.capture());
        assertEquals("[\"site:west\",\"level:critical\"]", deviceCaptor.getValue().getTags());
    }

    @Test
    void listBindingsShouldExposeReadableDeviceFields() {
        AppContextHolder.setTenantId(1L);

        DeviceTag tag = buildTag(5L, "env", "prod");
        DeviceBasicVO device = new DeviceBasicVO();
        device.setId(20L);
        device.setDeviceName("dev-20");
        device.setNickname("温度计");
        device.setProductId(9L);
        device.setProductName("仓库传感器");
        device.setTenantId(1L);

        when(tagMapper.selectById(5L)).thenReturn(tag);
        when(bindingMapper.selectList(any())).thenReturn(List.of(buildBinding(300L, 5L, 20L)));
        when(deviceMapper.selectBasicByIdsIgnoreTenant(List.of(20L))).thenReturn(List.of(device));

        List<DeviceTagBindingVO> result = service.listBindings(5L);

        assertEquals(1, result.size());
        assertEquals("dev-20", result.get(0).getDeviceName());
        assertEquals("温度计", result.get(0).getNickname());
        assertEquals("仓库传感器", result.get(0).getProductName());
        assertNotNull(result.get(0).getCreatedAt());
    }

    private DeviceTag buildTag(Long id, String tagKey, String tagValue) {
        DeviceTag tag = new DeviceTag();
        tag.setId(id);
        tag.setTenantId(1L);
        tag.setTagKey(tagKey);
        tag.setTagValue(tagValue);
        return tag;
    }

    private DeviceTagBinding buildBinding(Long id, Long tagId, Long deviceId) {
        DeviceTagBinding binding = new DeviceTagBinding();
        binding.setId(id);
        binding.setTagId(tagId);
        binding.setDeviceId(deviceId);
        binding.setCreatedAt(java.time.LocalDateTime.now());
        return binding;
    }
}
