package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.model.FrameDecodeResult;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.FrameDecodeEngine;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TcpUdpProtocolAdapterTest {

    @Mock
    private DeviceMessageProducer deviceMessageProducer;

    @Mock
    private ProtocolParseEngine protocolParseEngine;

    @Mock
    private FrameDecodeEngine frameDecodeEngine;

    private TcpUdpProtocolAdapter tcpUdpProtocolAdapter;

    @BeforeEach
    void setUp() {
        tcpUdpProtocolAdapter = new TcpUdpProtocolAdapter(
                new ObjectMapper(),
                deviceMessageProducer,
                protocolParseEngine,
                frameDecodeEngine
        );
    }

    @Test
    void handleTcpMessageShouldUseBindingContextForParseAndFallback() {
        TcpSessionInfo sessionInfo = new TcpSessionInfo();
        sessionInfo.setSessionId("tcp-1");
        sessionInfo.setRemoteAddress("127.0.0.1:10001");
        sessionInfo.setBinding(TcpUdpBindingContext.builder()
                .tenantId(1001L)
                .productId(2001L)
                .productKey("pk-demo")
                .deviceId(3001L)
                .deviceName("device-001")
                .build());

        when(frameDecodeEngine.decode(any(ParseContext.class), any(KnownDeviceContext.class)))
                .thenReturn(FrameDecodeResult.frames(List.of("{\"temp\":25}".getBytes(StandardCharsets.UTF_8))));
        when(protocolParseEngine.parse(any(ParseContext.class), any(KnownDeviceContext.class)))
                .thenReturn(ProtocolParseOutcome.notHandled());

        tcpUdpProtocolAdapter.handleTcpMessage("tcp-1", sessionInfo, "{\"temp\":25}".getBytes(StandardCharsets.UTF_8));

        ArgumentCaptor<ParseContext> frameContextCaptor = ArgumentCaptor.forClass(ParseContext.class);
        verify(frameDecodeEngine).decode(frameContextCaptor.capture(), any(KnownDeviceContext.class));
        ParseContext rawContext = frameContextCaptor.getValue();
        assertThat(rawContext.getProductId()).isEqualTo(2001L);
        assertThat(rawContext.getProductKey()).isEqualTo("pk-demo");
        assertThat(rawContext.getRemoteAddress()).isEqualTo("127.0.0.1:10001");

        ArgumentCaptor<ParseContext> contextCaptor = ArgumentCaptor.forClass(ParseContext.class);
        ArgumentCaptor<KnownDeviceContext> knownCaptor = ArgumentCaptor.forClass(KnownDeviceContext.class);
        verify(protocolParseEngine).parse(contextCaptor.capture(), knownCaptor.capture());

        ParseContext parseContext = contextCaptor.getValue();
        assertThat(parseContext.getProductId()).isEqualTo(2001L);
        assertThat(parseContext.getProductKey()).isEqualTo("pk-demo");
        assertThat(parseContext.getRemoteAddress()).isEqualTo("127.0.0.1:10001");

        KnownDeviceContext knownDeviceContext = knownCaptor.getValue();
        assertThat(knownDeviceContext.getTenantId()).isEqualTo(1001L);
        assertThat(knownDeviceContext.getProductId()).isEqualTo(2001L);
        assertThat(knownDeviceContext.getDeviceId()).isEqualTo(3001L);
        assertThat(knownDeviceContext.getDeviceName()).isEqualTo("device-001");
        assertThat(knownDeviceContext.getProductKey()).isEqualTo("pk-demo");

        ArgumentCaptor<DeviceMessage> messageCaptor = ArgumentCaptor.forClass(DeviceMessage.class);
        verify(deviceMessageProducer).publishUpstream(messageCaptor.capture());
        DeviceMessage fallback = messageCaptor.getValue();
        assertThat(fallback.getTenantId()).isEqualTo(1001L);
        assertThat(fallback.getProductId()).isEqualTo(2001L);
        assertThat(fallback.getDeviceId()).isEqualTo(3001L);
        assertThat(fallback.getDeviceName()).isEqualTo("device-001");
        assertThat(fallback.getPayload()).containsEntry("temp", 25);
    }

    @Test
    void handleTcpMessageShouldParseEachDecodedFrame() {
        TcpSessionInfo sessionInfo = new TcpSessionInfo();
        sessionInfo.setSessionId("tcp-1");
        sessionInfo.setRemoteAddress("127.0.0.1:10001");
        sessionInfo.setBinding(TcpUdpBindingContext.builder()
                .tenantId(1001L)
                .productId(2001L)
                .productKey("pk-demo")
                .build());

        DeviceMessage parsed = DeviceMessage.builder()
                .messageId("m-1")
                .tenantId(1001L)
                .productId(2001L)
                .deviceId(3002L)
                .deviceName("device-udp")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/tcp/data")
                .payload(Map.of("ok", true))
                .timestamp(System.currentTimeMillis())
                .build();

        when(frameDecodeEngine.decode(any(ParseContext.class), any(KnownDeviceContext.class)))
                .thenReturn(FrameDecodeResult.frames(List.of(
                        "first".getBytes(StandardCharsets.UTF_8),
                        "second".getBytes(StandardCharsets.UTF_8)
                )));
        when(protocolParseEngine.parse(any(ParseContext.class), any(KnownDeviceContext.class)))
                .thenReturn(ProtocolParseOutcome.handled(List.of(parsed)));

        tcpUdpProtocolAdapter.handleTcpMessage("tcp-1", sessionInfo, "raw".getBytes(StandardCharsets.UTF_8));

        verify(protocolParseEngine, times(2)).parse(any(ParseContext.class), any(KnownDeviceContext.class));
        verify(deviceMessageProducer, times(2)).publishUpstream(any(DeviceMessage.class));
    }

    @Test
    void handleUdpMessageShouldUsePeerBindingContext() {
        UdpServer.UdpPeerInfo peerInfo = new UdpServer.UdpPeerInfo();
        peerInfo.setAddress("127.0.0.1");
        peerInfo.setPort(8901);
        peerInfo.setBinding(TcpUdpBindingContext.builder()
                .tenantId(1001L)
                .productId(2001L)
                .productKey("pk-demo")
                .build());

        DeviceMessage parsed = DeviceMessage.builder()
                .messageId("m-1")
                .tenantId(1001L)
                .productId(2001L)
                .deviceId(3002L)
                .deviceName("device-udp")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/udp/data")
                .payload(Map.of("ok", true))
                .timestamp(System.currentTimeMillis())
                .build();

        when(protocolParseEngine.parse(any(ParseContext.class), any(KnownDeviceContext.class)))
                .thenReturn(ProtocolParseOutcome.handled(List.of(parsed)));

        tcpUdpProtocolAdapter.handleUdpMessage("127.0.0.1:8901", peerInfo, "raw-message".getBytes(StandardCharsets.UTF_8));

        ArgumentCaptor<ParseContext> contextCaptor = ArgumentCaptor.forClass(ParseContext.class);
        verify(protocolParseEngine).parse(contextCaptor.capture(), any(KnownDeviceContext.class));
        ParseContext parseContext = contextCaptor.getValue();
        assertThat(parseContext.getProductId()).isEqualTo(2001L);
        assertThat(parseContext.getProductKey()).isEqualTo("pk-demo");
        assertThat(parseContext.getRemoteAddress()).isEqualTo("127.0.0.1:8901");

        ArgumentCaptor<DeviceMessage> messageCaptor = ArgumentCaptor.forClass(DeviceMessage.class);
        verify(deviceMessageProducer).publishUpstream(messageCaptor.capture());
        assertThat(messageCaptor.getValue().getDeviceName()).isEqualTo("device-udp");
    }
}
