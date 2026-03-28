package com.songhg.firefly.iot.media.controller;

import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.service.VideoDeviceFacade;
import com.songhg.firefly.iot.media.service.VideoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ZlmHookControllerTest {

    @Mock
    private StreamSessionMapper streamSessionMapper;
    @Mock
    private VideoDeviceFacade videoDeviceFacade;
    @Mock
    private VideoService videoService;
    @Mock
    private EventPublisher eventPublisher;

    private ZlmHookController controller;

    @BeforeEach
    void setUp() {
        controller = new ZlmHookController(streamSessionMapper, videoDeviceFacade, videoService, eventPublisher);
    }

    @Test
    void onStreamNoneReaderActivelyCleansUpLiveProxyStream() {
        when(videoService.cleanupProxyStreamOnNoReader("live", "2_12_0")).thenReturn(true);

        Map<String, Object> result = controller.onStreamNoneReader(Map.of(
                "app", "live",
                "stream", "2_12_0",
                "schema", "rtsp"
        ));

        assertThat(result).containsEntry("code", 0).containsEntry("close", false);
        verify(videoService).cleanupProxyStreamOnNoReader("live", "2_12_0");
    }

    @Test
    void onStreamNoneReaderFallsBackToZlmCloseWhenCleanupFails() {
        when(videoService.cleanupProxyStreamOnNoReader("live", "2_12_0"))
                .thenThrow(new RuntimeException("cleanup failed"));

        Map<String, Object> result = controller.onStreamNoneReader(Map.of(
                "app", "live",
                "stream", "2_12_0",
                "schema", "rtsp"
        ));

        assertThat(result).containsEntry("code", 0).containsEntry("close", true);
        verify(videoService).cleanupProxyStreamOnNoReader("live", "2_12_0");
    }

    @Test
    void onStreamNoneReaderKeepsRtpStreamOpen() {
        Map<String, Object> result = controller.onStreamNoneReader(Map.of(
                "app", "rtp",
                "stream", "2_12_0",
                "schema", "rtsp"
        ));

        assertThat(result).containsEntry("code", 0).containsEntry("close", false);
        verify(videoService, never()).cleanupProxyStreamOnNoReader("rtp", "2_12_0");
    }
}
