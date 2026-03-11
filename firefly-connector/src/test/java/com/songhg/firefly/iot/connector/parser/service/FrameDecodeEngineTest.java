package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import com.songhg.firefly.iot.connector.parser.model.FrameDecodeResult;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FrameDecodeEngineTest {

    @Mock
    private PublishedProtocolParserService publishedProtocolParserService;

    private FrameDecodeEngine frameDecodeEngine;

    @BeforeEach
    void setUp() {
        frameDecodeEngine = new FrameDecodeEngine(
                new ObjectMapper(),
                new TcpUdpProperties(),
                publishedProtocolParserService,
                new ProtocolParserMatcher(new ObjectMapper()),
                new ProtocolParserReleaseMatcher(new ObjectMapper()),
                new FrameSessionBufferStore()
        );
    }

    @Test
    void decodeDelimiterShouldAccumulateFramesAcrossPackets() {
        ProtocolParserPublishedDTO definition = tcpDefinition("DELIMITER", "{\"delimiter\":\"\\n\"}");
        when(publishedProtocolParserService.getPublishedDefinitions(2001L)).thenReturn(List.of(definition));

        ParseContext firstPacket = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                "AA\nBB".getBytes(StandardCharsets.UTF_8),
                Map.of(),
                "tcp-1",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );
        FrameDecodeResult firstResult = frameDecodeEngine.decode(firstPacket, null);
        assertThat(firstResult.getFrames()).hasSize(1);
        assertThat(new String(firstResult.getFrames().get(0), StandardCharsets.UTF_8)).isEqualTo("AA");

        ParseContext secondPacket = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                "\nCC\n".getBytes(StandardCharsets.UTF_8),
                Map.of(),
                "tcp-1",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );
        FrameDecodeResult secondResult = frameDecodeEngine.decode(secondPacket, null);
        assertThat(secondResult.getFrames()).hasSize(2);
        assertThat(new String(secondResult.getFrames().get(0), StandardCharsets.UTF_8)).isEqualTo("BB");
        assertThat(new String(secondResult.getFrames().get(1), StandardCharsets.UTF_8)).isEqualTo("CC");
    }

    @Test
    void decodeLengthFieldShouldSplitBinaryFrames() {
        ProtocolParserPublishedDTO definition = tcpDefinition(
                "LENGTH_FIELD",
                "{\"lengthFieldOffset\":1,\"lengthFieldLength\":1,\"initialBytesToStrip\":2}"
        );
        when(publishedProtocolParserService.getPublishedDefinitions(2001L)).thenReturn(List.of(definition));

        byte[] payload = new byte[] {
                (byte) 0xAA, 0x03, 0x01, 0x02, 0x03,
                (byte) 0xAA, 0x02, 0x0B, 0x0C
        };
        ParseContext parseContext = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                payload,
                Map.of(),
                "tcp-1",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );

        FrameDecodeResult result = frameDecodeEngine.decode(parseContext, null);

        assertThat(result.getFrames()).hasSize(2);
        assertThat(result.getFrames().get(0)).containsExactly((byte) 0x01, (byte) 0x02, (byte) 0x03);
        assertThat(result.getFrames().get(1)).containsExactly((byte) 0x0B, (byte) 0x0C);
    }

    @Test
    void decodeShouldFallbackToLegacyLineModeWhenNoDefinitionMatched() {
        when(publishedProtocolParserService.getPublishedDefinitions(2001L)).thenReturn(List.of());

        ParseContext parseContext = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                "AA\r\nBB\r\n".getBytes(StandardCharsets.UTF_8),
                Map.of(),
                "tcp-legacy",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );

        FrameDecodeResult result = frameDecodeEngine.decode(parseContext, null);

        assertThat(result.getFrames()).hasSize(2);
        assertThat(new String(result.getFrames().get(0), StandardCharsets.UTF_8)).isEqualTo("AA");
        assertThat(new String(result.getFrames().get(1), StandardCharsets.UTF_8)).isEqualTo("BB");
    }

    @Test
    void decodeShouldSkipDefinitionsOutsideReleaseScope() {
        ProtocolParserPublishedDTO outOfRelease = tcpDefinition(
                "DELIMITER",
                "{\"delimiter\":\"\\n\"}"
        );
        outOfRelease.setReleaseMode("DEVICE_LIST");
        outOfRelease.setReleaseConfigJson("{\"deviceNames\":[\"dev-b\"]}");

        ProtocolParserPublishedDTO inRelease = tcpDefinition(
                "FIXED_LENGTH",
                "{\"fixedLength\":2}"
        );
        inRelease.setDefinitionId(2L);
        inRelease.setReleaseMode("ALL");

        when(publishedProtocolParserService.getPublishedDefinitions(2001L)).thenReturn(List.of(outOfRelease, inRelease));

        ParseContext parseContext = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                "ABCD".getBytes(StandardCharsets.UTF_8),
                Map.of(),
                "tcp-release",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );

        FrameDecodeResult result = frameDecodeEngine.decode(
                parseContext,
                KnownDeviceContext.builder()
                        .tenantId(1L)
                        .productId(2001L)
                        .deviceId(1001L)
                        .deviceName("dev-a")
                        .productKey("pk-demo")
                        .build()
        );

        assertThat(result.getFrames()).hasSize(2);
        assertThat(new String(result.getFrames().get(0), StandardCharsets.UTF_8)).isEqualTo("AB");
        assertThat(new String(result.getFrames().get(1), StandardCharsets.UTF_8)).isEqualTo("CD");
    }

    @Test
    void decodeShouldDiscardOversizedRemainder() {
        ProtocolParserPublishedDTO definition = tcpDefinition(
                "DELIMITER",
                "{\"delimiter\":\"\\n\",\"maxBufferedBytes\":4}"
        );
        when(publishedProtocolParserService.getPublishedDefinitions(2001L)).thenReturn(List.of(definition));

        ParseContext parseContext = ProtocolParseEngine.buildContext(
                "TCP_UDP",
                "TCP",
                "/tcp/data",
                "ABCDE".getBytes(StandardCharsets.UTF_8),
                Map.of(),
                "tcp-oversize",
                "127.0.0.1:10001",
                2001L,
                "pk-demo"
        );

        FrameDecodeResult result = frameDecodeEngine.decode(parseContext, null);

        assertThat(result.getFrames()).isEmpty();
        assertThat(result.isNeedMoreData()).isFalse();
    }

    private ProtocolParserPublishedDTO tcpDefinition(String frameMode, String frameConfigJson) {
        ProtocolParserPublishedDTO definition = new ProtocolParserPublishedDTO();
        definition.setDefinitionId(1L);
        definition.setProtocol("TCP_UDP");
        definition.setTransport("TCP");
        definition.setDirection("UPLINK");
        definition.setFrameMode(frameMode);
        definition.setFrameConfigJson(frameConfigJson);
        return definition;
    }
}
