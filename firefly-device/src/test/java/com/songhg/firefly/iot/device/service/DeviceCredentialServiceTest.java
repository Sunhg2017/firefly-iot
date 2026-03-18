package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.dto.DeviceRegisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceCredentialServiceTest {

    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final DeviceService deviceService = mock(DeviceService.class);
    private final DeviceCredentialService service =
            new DeviceCredentialService(productMapper, deviceMapper, redisTemplate, deviceService);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void dynamicRegisterShouldAllowDevelopmentProduct() {
        Product product = new Product();
        product.setId(11L);
        product.setTenantId(22L);
        product.setProjectId(33L);
        product.setProductKey("pk_debug");
        product.setProductSecret("ps_debug");
        product.setDeviceAuthType(DeviceAuthType.PRODUCT_SECRET);
        product.setStatus(ProductStatus.DEVELOPMENT);
        product.setDeviceCount(0);

        when(productMapper.selectByProductKeyIgnoreTenant("pk_debug")).thenReturn(product);
        when(deviceMapper.selectOne(any())).thenReturn(null);
        doAnswer(invocation -> {
            Device device = invocation.getArgument(0);
            device.setId(101L);
            return 1;
        }).when(deviceMapper).insert(any(Device.class));

        DeviceRegisterRequestDTO request = new DeviceRegisterRequestDTO();
        request.setProductKey("pk_debug");
        request.setProductSecret("ps_debug");
        request.setDeviceName("debug-device-01");
        request.setNickname("调试设备");

        DeviceRegisterDTO result = service.dynamicRegister(request);

        assertTrue(result.isSuccess());
        assertEquals("debug-device-01", result.getDeviceName());
        assertNotNull(result.getDeviceSecret());

        ArgumentCaptor<Device> deviceCaptor = ArgumentCaptor.forClass(Device.class);
        verify(deviceMapper).insert(deviceCaptor.capture());
        assertEquals("调试设备", deviceCaptor.getValue().getNickname());

        verify(productMapper).updateById(product);
        assertEquals(1, product.getDeviceCount());
    }
}
