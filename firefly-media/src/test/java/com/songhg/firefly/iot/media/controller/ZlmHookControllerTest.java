package com.songhg.firefly.iot.media.controller;

import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.media.entity.VideoRecording;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.mapper.VideoRecordingMapper;
import com.songhg.firefly.iot.media.service.VideoDeviceFacade;
import com.songhg.firefly.iot.media.service.VideoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
    @Mock
    private VideoRecordingMapper videoRecordingMapper;

    private ZlmHookController controller;

    @BeforeEach
    void setUp() {
        controller = new ZlmHookController(streamSessionMapper, videoDeviceFacade, videoService, eventPublisher,
                videoRecordingMapper);
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

    @Test
    void onPublishAllowsManagedLocalProxyWithMatchingCredentials() {
        InternalVideoDeviceVO device = new InternalVideoDeviceVO();
        device.setDeviceId(12L);
        device.setAuthEnabled(true);
        device.setAuthUsername("sim-user");
        device.setAuthPassword("sim-pass");
        when(videoDeviceFacade.getByProxyStream(StreamMode.RTSP, "live", "simcam-video02")).thenReturn(device);

        Map<String, Object> result = controller.onPublish(Map.of(
                "app", "live",
                "stream", "simcam-video02",
                "schema", "rtsp",
                "params", "authUser=sim-user&authPass=sim-pass"
        ));

        assertThat(result).containsEntry("code", 0).containsEntry("enable_hls", true);
        verify(videoDeviceFacade).getByProxyStream(StreamMode.RTSP, "live", "simcam-video02");
    }

    @Test
    void onPlayRejectsManagedLocalProxyWithWrongCredentials() {
        InternalVideoDeviceVO device = new InternalVideoDeviceVO();
        device.setDeviceId(12L);
        device.setAuthEnabled(true);
        device.setAuthUsername("sim-user");
        device.setAuthPassword("sim-pass");
        when(videoDeviceFacade.getByProxyStream(StreamMode.RTSP, "live", "simcam-video02")).thenReturn(device);

        Map<String, Object> result = controller.onPlay(Map.of(
                "app", "live",
                "stream", "simcam-video02",
                "schema", "rtsp",
                "params", "authUser=sim-user&authPass=wrong-pass"
        ));

        assertThat(result).containsEntry("code", -1);
        verify(videoDeviceFacade).getByProxyStream(StreamMode.RTSP, "live", "simcam-video02");
    }

    @Test
    void onRecordMp4PersistsRecordingMetadataFromManagedStream() {
        Map<String, Object> result = controller.onRecordMp4(Map.of(
                "app", "rtp",
                "stream", "7_42_34020000001320000001",
                "file_name", "15-53-02.mp4",
                "file_path", "/record/rtp/7_42_34020000001320000001/15-53-02.mp4",
                "file_size", 1913597,
                "start_time", 1568965982,
                "time_len", 11.0
        ));

        assertThat(result).containsEntry("code", 0);
        ArgumentCaptor<VideoRecording> captor = ArgumentCaptor.forClass(VideoRecording.class);
        verify(videoRecordingMapper).insertIgnore(captor.capture());
        VideoRecording recording = captor.getValue();
        assertThat(recording.getTenantId()).isEqualTo(7L);
        assertThat(recording.getDeviceId()).isEqualTo(42L);
        assertThat(recording.getChannelId()).isEqualTo("34020000001320000001");
        assertThat(recording.getFileSize()).isEqualTo(1913597L);
        assertThat(recording.getStartTime()).isEqualTo(1568965982000L);
        assertThat(recording.getDurationSeconds()).isEqualTo(11.0);
    }

    @Test
    void onRecordMp4IgnoresUnmanagedStream() {
        Map<String, Object> result = controller.onRecordMp4(Map.of(
                "app", "live",
                "stream", "simcam-video02",
                "file_name", "x.mp4",
                "file_path", "/record/live/simcam-video02/x.mp4"
        ));

        assertThat(result).containsEntry("code", 0);
        verify(videoRecordingMapper, never()).insertIgnore(any());
    }
}
