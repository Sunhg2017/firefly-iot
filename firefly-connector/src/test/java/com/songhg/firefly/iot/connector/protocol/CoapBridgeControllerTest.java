package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CoapBridgeControllerTest {

    private final CoapProtocolAdapter coapAdapter = mock(CoapProtocolAdapter.class);
    private final DeviceAuthService authService = mock(DeviceAuthService.class);
    private final CoapBridgeController controller = new CoapBridgeController(coapAdapter, authService);

    @Test
    void shouldFailAuthenticationWhenTokenIssueFails() {
        DeviceAuthResult auth = DeviceAuthResult.success(3L, 1L, 2L);
        when(coapAdapter.authenticate("{}".getBytes())).thenReturn(auth);
        when(authService.issueToken(3L, 1L, 2L, Duration.ofDays(7))).thenReturn(null);

        R<Map<String, Object>> response = controller.authenticate("{}".getBytes());

        assertEquals(500, response.getCode());
        assertEquals("TOKEN_ISSUE_FAILED", response.getMessage());
    }

    @Test
    void shouldRejectPropertyReportWhenTokenInvalid() {
        when(coapAdapter.handlePropertyReport("bad-token", "{}".getBytes()))
                .thenReturn(DeviceAuthResult.fail("UNAUTHORIZED"));

        R<Void> response = controller.reportProperty("bad-token", "{}".getBytes());

        assertEquals(401, response.getCode());
        assertEquals("UNAUTHORIZED", response.getMessage());
    }
}
