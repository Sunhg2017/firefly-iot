package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.dto.certificate.SasTokenVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SasTokenServiceTest {

    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final SasTokenService service = new SasTokenService(deviceMapper);

    @BeforeEach
    void setUp() {
        AppContextHolder.setTenantId(1L);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void issueAndValidateRoundTrip() {
        Device device = device();
        when(deviceMapper.selectOne(any())).thenReturn(device);

        SasTokenVO token = service.issue(10L, 3600);

        assertNotNull(token.getToken());
        assertTrue(service.validate(device, token.getToken()));
    }

    @Test
    void rejectsTamperedSignature() {
        Device device = device();
        when(deviceMapper.selectOne(any())).thenReturn(device);

        String token = service.issue(10L, 3600).getToken();
        String tampered = token.substring(0, token.length() - 2) + "xx";

        assertFalse(service.validate(device, tampered));
    }

    @Test
    void rejectsTokenForAnotherDevice() {
        Device device = device();
        when(deviceMapper.selectOne(any())).thenReturn(device);
        String token = service.issue(10L, 3600).getToken();

        Device another = device();
        another.setId(99L);

        assertFalse(service.validate(another, token));
    }

    @Test
    void rejectsMalformedToken() {
        assertFalse(service.validate(device(), "not-a-token"));
    }

    private Device device() {
        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);
        device.setProductId(2L);
        device.setDeviceName("dev-001");
        device.setDeviceSecret("secret-123");
        return device;
    }
}
