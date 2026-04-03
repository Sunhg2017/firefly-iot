package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceResolveRequestDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTelemetryMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SharedDeviceReadServiceTest {

    @Mock
    private DeviceMapper deviceMapper;

    @Mock
    private ProductMapper productMapper;

    @Mock
    private DeviceTelemetryMapper deviceTelemetryMapper;

    @Test
    void shouldResolveSharedDevicesWithinOwnerTenantScope() {
        SharedDeviceReadService service = new SharedDeviceReadService(
                deviceMapper,
                productMapper,
                deviceTelemetryMapper,
                new ObjectMapper()
        );
        Product product = new Product();
        product.setId(11L);
        product.setTenantId(1001L);
        product.setProductKey("pk-meter");

        DeviceBasicVO device = new DeviceBasicVO();
        device.setId(21L);
        device.setTenantId(1001L);
        device.setProductId(11L);
        device.setProductKey("pk-meter");
        device.setDeviceName("meter-01");

        SharedDeviceResolveRequestDTO request = new SharedDeviceResolveRequestDTO();
        request.setOwnerTenantId(1001L);
        request.setScope("""
                {"productKeys":["pk-meter"],"deviceNames":["meter-01"]}
                """);

        when(productMapper.selectByProductKeyIgnoreTenant("pk-meter")).thenReturn(product);
        when(deviceMapper.selectSharedBasicsIgnoreTenant(1001L, List.of(11L), List.of("meter-01")))
                .thenReturn(List.of(device));

        List<DeviceBasicVO> result = service.resolveSharedDevices(request);

        assertEquals(1, result.size());
        assertEquals(21L, result.getFirst().getId());
        verify(deviceMapper).selectSharedBasicsIgnoreTenant(1001L, List.of(11L), List.of("meter-01"));
    }

    @Test
    void shouldRejectSharedLatestQueryWhenDeviceBelongsToDifferentOwnerTenant() {
        SharedDeviceReadService service = new SharedDeviceReadService(
                deviceMapper,
                productMapper,
                deviceTelemetryMapper,
                new ObjectMapper()
        );
        Device device = new Device();
        device.setId(31L);
        device.setTenantId(2002L);

        when(deviceMapper.selectByIdIgnoreTenant(31L)).thenReturn(device);

        BizException ex = assertThrows(BizException.class, () -> service.querySharedLatest(1001L, 31L));

        assertEquals(ResultCode.DEVICE_NOT_FOUND.getCode(), ex.getCode());
    }

    @Test
    void shouldReturnSharedLatestTelemetryForOwnedDevice() {
        SharedDeviceReadService service = new SharedDeviceReadService(
                deviceMapper,
                productMapper,
                deviceTelemetryMapper,
                new ObjectMapper()
        );
        Device device = new Device();
        device.setId(41L);
        device.setTenantId(1001L);

        DeviceTelemetrySnapshotDTO snapshot = new DeviceTelemetrySnapshotDTO();
        snapshot.setProperty("temperature");
        snapshot.setValueNumber(23.5);

        when(deviceMapper.selectByIdIgnoreTenant(41L)).thenReturn(device);
        when(deviceTelemetryMapper.queryLatestIgnoreTenant(1001L, 41L)).thenReturn(List.of(snapshot));

        List<DeviceTelemetrySnapshotDTO> result = service.querySharedLatest(1001L, 41L);

        assertEquals(1, result.size());
        assertEquals("temperature", result.getFirst().getProperty());
    }
}
