package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.device.dto.device.BatchOperationResultVO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCommandDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchGroupDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchTagDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceBatchOperationServiceTest {

    private final DeviceService deviceService = mock(DeviceService.class);
    private final DeviceTagService deviceTagService = mock(DeviceTagService.class);
    private final DeviceGroupService deviceGroupService = mock(DeviceGroupService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final DeviceBatchOperationService service = new DeviceBatchOperationService(
            deviceService, deviceTagService, deviceGroupService, messageProducer, deviceMapper);

    @Test
    void batchEnableAggregatesPerDeviceFailures() {
        doThrow(new RuntimeException("scope denied")).when(deviceService).enableDevice(2L);

        BatchOperationResultVO result = service.batchEnable(List.of(1L, 2L));

        assertEquals(2, result.getRequested());
        assertEquals(1, result.getSuccess());
        assertEquals(1, result.getFailed());
        assertEquals(2L, result.getFailures().get(0).getDeviceId());
    }

    @Test
    void batchTagAppendKeepsExistingTags() {
        DeviceTag existing = new DeviceTag();
        existing.setId(100L);
        when(deviceTagService.getDeviceTags(1L)).thenReturn(List.of(existing));

        DeviceBatchTagDTO dto = new DeviceBatchTagDTO();
        dto.setDeviceIds(List.of(1L));
        dto.setTagIds(List.of(200L));
        dto.setOverwrite(false);

        BatchOperationResultVO result = service.batchTag(dto);

        assertEquals(1, result.getSuccess());
        verify(deviceTagService).syncDeviceTags(eq(1L), any());
    }

    @Test
    void batchGroupAddMergesExistingGroups() {
        DeviceGroup existing = new DeviceGroup();
        existing.setId(10L);
        when(deviceGroupService.getDeviceGroups(1L)).thenReturn(List.of(existing));

        DeviceBatchGroupDTO dto = new DeviceBatchGroupDTO();
        dto.setDeviceIds(List.of(1L));
        dto.setGroupIds(List.of(20L));
        dto.setAction("ADD");

        BatchOperationResultVO result = service.batchGroup(dto);

        assertEquals(1, result.getSuccess());
        verify(deviceGroupService).syncDeviceGroups(eq(1L), any());
    }

    @Test
    void batchCommandPublishesDownlinkForEachDevice() {
        Device device = new Device();
        device.setId(1L);
        device.setTenantId(1L);
        device.setProductId(2L);
        device.setDeviceName("dev-001");
        when(deviceMapper.selectById(anyLong())).thenReturn(device);

        DeviceBatchCommandDTO dto = new DeviceBatchCommandDTO();
        dto.setDeviceIds(List.of(1L));
        dto.setCommandType("PROPERTY_SET");
        dto.setPayload(java.util.Map.of("interval", 30));

        BatchOperationResultVO result = service.batchCommand(dto);

        assertEquals(1, result.getSuccess());
        assertTrue(result.getFailures().isEmpty());
        verify(messageProducer).publishDownstream(any());
    }
}
