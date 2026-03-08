package com.songhg.firefly.iot.connector.parser.service;

import com.songhg.firefly.iot.api.client.DeviceLocatorClient;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import com.songhg.firefly.iot.connector.protocol.DeviceAuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceIdentityResolveServiceTest {

    @Mock
    private DeviceLocatorClient deviceLocatorClient;

    @Mock
    private DeviceAuthService deviceAuthService;

    private DeviceIdentityResolveService deviceIdentityResolveService;

    @BeforeEach
    void setUp() {
        deviceIdentityResolveService = new DeviceIdentityResolveService(deviceLocatorClient, deviceAuthService);
    }

    @Test
    void resolveShouldShortCircuitWhenKnownDeviceContextExists() {
        KnownDeviceContext knownDeviceContext = KnownDeviceContext.builder()
                .tenantId(88L)
                .productId(1001L)
                .deviceId(2002L)
                .deviceName("device-a")
                .productKey("pk-known")
                .build();

        ParseContext parseContext = ParseContext.builder()
                .productKey("pk-parse")
                .build();

        ResolvedDeviceContext resolved = deviceIdentityResolveService.resolve(parseContext, knownDeviceContext, null);

        assertThat(resolved.getTenantId()).isEqualTo(88L);
        assertThat(resolved.getProductId()).isEqualTo(1001L);
        assertThat(resolved.getDeviceId()).isEqualTo(2002L);
        assertThat(resolved.getDeviceName()).isEqualTo("device-a");
        assertThat(resolved.getProductKey()).isEqualTo("pk-known");
        verifyNoInteractions(deviceLocatorClient, deviceAuthService);
    }

    @Test
    void resolveByDeviceNameShouldUseLocatorRpc() {
        ParsedDeviceIdentity identity = new ParsedDeviceIdentity();
        identity.setMode("BY_DEVICE_NAME");
        identity.setDeviceName("meter-01");

        ParseContext parseContext = ParseContext.builder()
                .productKey("pk-demo")
                .headers(Map.of())
                .build();

        DeviceLocatorResolveDTO locatorResolveDTO = new DeviceLocatorResolveDTO();
        locatorResolveDTO.setSuccess(true);
        locatorResolveDTO.setTenantId(66L);
        locatorResolveDTO.setProductId(1001L);
        locatorResolveDTO.setDeviceId(3003L);
        locatorResolveDTO.setDeviceName("meter-01");
        when(deviceLocatorClient.resolveByLocator(org.mockito.ArgumentMatchers.any(DeviceLocatorResolveRequestDTO.class)))
                .thenReturn(R.ok(locatorResolveDTO));

        ResolvedDeviceContext resolved = deviceIdentityResolveService.resolve(parseContext, null, identity);

        assertThat(resolved.getTenantId()).isEqualTo(66L);
        assertThat(resolved.getProductId()).isEqualTo(1001L);
        assertThat(resolved.getDeviceId()).isEqualTo(3003L);
        assertThat(resolved.getDeviceName()).isEqualTo("meter-01");
        assertThat(resolved.getProductKey()).isEqualTo("pk-demo");

        ArgumentCaptor<DeviceLocatorResolveRequestDTO> requestCaptor =
                ArgumentCaptor.forClass(DeviceLocatorResolveRequestDTO.class);
        verify(deviceLocatorClient).resolveByLocator(requestCaptor.capture());
        DeviceLocatorResolveRequestDTO request = requestCaptor.getValue();
        assertThat(request.getProductKey()).isEqualTo("pk-demo");
        assertThat(request.getLocatorType()).isEqualTo("DEVICE_NAME");
        assertThat(request.getLocatorValue()).isEqualTo("meter-01");
        verifyNoInteractions(deviceAuthService);
    }
}
