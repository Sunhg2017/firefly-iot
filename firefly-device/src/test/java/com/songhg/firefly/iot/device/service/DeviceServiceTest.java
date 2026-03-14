package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceServiceTest {

    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final DeviceLocatorService deviceLocatorService = mock(DeviceLocatorService.class);
    private final DeviceTagService deviceTagService = mock(DeviceTagService.class);
    private final DeviceGroupService deviceGroupService = mock(DeviceGroupService.class);
    private final DeviceService service =
            new DeviceService(deviceMapper, productMapper, deviceLocatorService, deviceTagService, deviceGroupService);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void enableDeviceShouldRebuildDynamicGroups() {
        Device device = new Device();
        device.setId(7L);
        device.setStatus(DeviceStatus.DISABLED);
        device.setDeviceName("dev-007");

        when(deviceMapper.selectById(7L)).thenReturn(device);

        service.enableDevice(7L);

        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(7L);
    }

    @Test
    void updateRuntimeConnectionStateShouldRebuildDynamicGroups() {
        Device device = new Device();
        device.setId(8L);
        device.setTenantId(1L);
        device.setStatus(DeviceStatus.ACTIVE);
        device.setOnlineStatus(OnlineStatus.OFFLINE);

        when(deviceMapper.selectByIdIgnoreTenant(8L)).thenReturn(device);

        service.updateRuntimeConnectionState(1L, 8L, OnlineStatus.ONLINE, null);

        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(8L);
    }
}
