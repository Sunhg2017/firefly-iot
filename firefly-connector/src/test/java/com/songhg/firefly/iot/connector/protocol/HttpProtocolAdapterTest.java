package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HttpProtocolAdapterTest {

    private final DeviceAuthService authService = mock(DeviceAuthService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final MessageCodec messageCodec = mock(MessageCodec.class);
    private final ProtocolParseEngine protocolParseEngine = mock(ProtocolParseEngine.class);
    private final HttpDeviceLifecycleService lifecycleService = mock(HttpDeviceLifecycleService.class);
    private final HttpProtocolAdapter adapter = new HttpProtocolAdapter(
            authService,
            messageProducer,
            messageCodec,
            protocolParseEngine,
            lifecycleService
    );

    @Test
    void shouldRejectLifecycleEventOnGenericEventEndpoint() {
        DeviceAuthResult auth = successAuth();
        when(authService.authenticateByToken("token")).thenReturn(auth);

        R<Void> response = adapter.reportEvent("token", Map.of("identifier", "offline"));

        assertEquals(400, response.getCode());
        assertEquals("HTTP_LIFECYCLE_EVENT_MUST_USE_DEDICATED_ENDPOINT", response.getMessage());
        verify(lifecycleService, never()).markActive(auth, "event");
        verify(messageProducer, never()).publishUpstream(any(DeviceMessage.class));
    }

    @Test
    void shouldPublishBuiltinOnlineEventFromDedicatedEndpoint() {
        DeviceAuthResult auth = successAuth();
        when(authService.authenticateByToken("token")).thenReturn(auth);

        R<Void> response = adapter.online("token", Map.of("ip", "192.168.10.2"));

        assertEquals(0, response.getCode());
        verify(lifecycleService).markActive(auth, "online");
        verify(messageProducer).publishUpstream(argThat(message ->
                message.getType() == DeviceMessage.MessageType.EVENT_REPORT
                        && "/sys/http/3/thing/event/post".equals(message.getTopic())
                        && "online".equals(message.getPayload().get("identifier"))
                        && "HTTP".equals(message.getPayload().get("protocol"))
                        && "192.168.10.2".equals(message.getPayload().get("ip"))
        ));
    }

    @Test
    void shouldPublishBuiltinOfflineEventFromDedicatedEndpoint() {
        DeviceAuthResult auth = successAuth();
        when(authService.authenticateByToken("token")).thenReturn(auth);

        R<Void> response = adapter.offline("token", Map.of("reason", "manual_disconnect"));

        assertEquals(0, response.getCode());
        verify(lifecycleService).markOffline(auth, "manual_disconnect");
        verify(messageProducer).publishUpstream(argThat(message ->
                message.getType() == DeviceMessage.MessageType.EVENT_REPORT
                        && "/sys/http/3/thing/event/post".equals(message.getTopic())
                        && "offline".equals(message.getPayload().get("identifier"))
                        && "manual_disconnect".equals(message.getPayload().get("reason"))
        ));
    }

    @Test
    void shouldPublishBuiltinHeartbeatEventFromDedicatedEndpoint() {
        DeviceAuthResult auth = successAuth();
        when(authService.authenticateByToken("token")).thenReturn(auth);

        R<Void> response = adapter.heartbeat("token", Map.of("intervalSec", 30));

        assertEquals(0, response.getCode());
        verify(lifecycleService).markActive(auth, "heartbeat");
        verify(messageProducer).publishUpstream(argThat(message ->
                message.getType() == DeviceMessage.MessageType.EVENT_REPORT
                        && "/sys/http/3/thing/event/post".equals(message.getTopic())
                        && "heartbeat".equals(message.getPayload().get("identifier"))
                        && Integer.valueOf(30).equals(message.getPayload().get("intervalSec"))
        ));
    }

    private DeviceAuthResult successAuth() {
        return DeviceAuthResult.success(3L, 1L, 2L);
    }
}
