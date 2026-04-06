package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MqttProtocolAdapterTest {

    private final DeviceAuthService authService = mock(DeviceAuthService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final MessageCodec messageCodec = mock(MessageCodec.class);
    private final ProtocolParseEngine protocolParseEngine = mock(ProtocolParseEngine.class);
    private final MqttProtocolAdapter adapter = new MqttProtocolAdapter(
            authService,
            messageProducer,
            messageCodec,
            protocolParseEngine
    );

    @Test
    void shouldIgnoreMalformedHeaderIdsAndResolveSessionOnDecode() {
        when(messageCodec.extractIdentity("/sys/pk-1/dev-1/thing/property/post"))
                .thenReturn(new String[]{"pk-1", "dev-1"});
        when(authService.resolveSession("pk-1", "dev-1"))
                .thenReturn(DeviceAuthResult.success(3L, 1L, 2L));

        DeviceMessage decoded = DeviceMessage.builder()
                .deviceId(3L)
                .tenantId(1L)
                .productId(2L)
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-1/dev-1/thing/property/post")
                .payload(Map.of("temp", 24))
                .build();
        when(messageCodec.decodeJson(any(), any(), any(), any(), any())).thenReturn(decoded);

        assertDoesNotThrow(() -> adapter.decode(
                "/sys/pk-1/dev-1/thing/property/post",
                "{\"temp\":24}".getBytes(),
                Map.of("deviceId", "oops", "tenantId", "bad", "productId", "NaN")
        ));
    }

    @Test
    void shouldIgnoreMalformedHeaderIdsAndStillPublishMessage() {
        when(messageCodec.extractIdentity("/sys/pk-1/dev-1/thing/property/post"))
                .thenReturn(new String[]{"pk-1", "dev-1"});
        when(authService.resolveSession("pk-1", "dev-1"))
                .thenReturn(DeviceAuthResult.success(3L, 1L, 2L));
        when(protocolParseEngine.parse(any(), any())).thenReturn(ProtocolParseOutcome.notHandled());

        DeviceMessage decoded = DeviceMessage.builder()
                .deviceId(3L)
                .tenantId(1L)
                .productId(2L)
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-1/dev-1/thing/property/post")
                .payload(Map.of("temp", 24))
                .build();
        when(messageCodec.decodeJson(any(), any(), any(), any(), any())).thenReturn(decoded);

        assertDoesNotThrow(() -> adapter.onMessage(
                "/sys/pk-1/dev-1/thing/property/post",
                "{\"temp\":24}".getBytes(),
                Map.of("deviceId", "oops", "tenantId", "bad", "productId", "NaN")
        ));

        verify(messageProducer).publishUpstream(decoded);
    }
}
