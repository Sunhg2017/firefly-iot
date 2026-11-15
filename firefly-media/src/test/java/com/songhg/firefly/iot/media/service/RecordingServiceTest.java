package com.songhg.firefly.iot.media.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.media.dto.video.VideoRecordingVO;
import com.songhg.firefly.iot.media.entity.VideoRecording;
import com.songhg.firefly.iot.media.mapper.VideoRecordingMapper;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import com.songhg.firefly.iot.media.zlm.ZlmMp4RecordDownload;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecordingServiceTest {

    @Mock
    private VideoRecordingMapper videoRecordingMapper;
    @Mock
    private ZlmApiClient zlmApiClient;

    private RecordingService recordingService;

    @BeforeEach
    void setUp() {
        recordingService = new RecordingService(videoRecordingMapper, zlmApiClient);
        AppContextHolder.setTenantId(7L);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void listRecordingsMapsToBusinessKeyVo() {
        VideoRecording recording = new VideoRecording();
        recording.setTenantId(7L);
        recording.setDeviceId(42L);
        recording.setFileName("15-53-02.mp4");
        recording.setFileSize(1913597L);
        recording.setStartTime(1568965982000L);
        recording.setDurationSeconds(11.0);
        recording.setChannelId("34020000001320000001");
        when(videoRecordingMapper.selectList(any())).thenReturn(List.of(recording));

        List<VideoRecordingVO> result = recordingService.listRecordings(42L);

        assertThat(result).hasSize(1);
        VideoRecordingVO vo = result.get(0);
        assertThat(vo.getFileName()).isEqualTo("15-53-02.mp4");
        assertThat(vo.getFileSize()).isEqualTo(1913597L);
        assertThat(vo.getStartTime()).isEqualTo(1568965982000L);
        assertThat(vo.getDurationSeconds()).isEqualTo(11.0);
        assertThat(vo.getChannelId()).isEqualTo("34020000001320000001");
    }

    @Test
    void resolveRecordingThrowsWhenNotFound() {
        when(videoRecordingMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> recordingService.resolveRecording(42L, "missing.mp4", 0L))
                .isInstanceOf(BizException.class);
    }

    @Test
    void openRecordingStreamDelegatesToZlmClient() {
        VideoRecording recording = new VideoRecording();
        recording.setTenantId(7L);
        recording.setDeviceId(42L);
        recording.setApp("rtp");
        recording.setStream("7_42_34020000001320000001");
        recording.setFilePath("/record/rtp/7_42_34020000001320000001/15-53-02.mp4");
        when(videoRecordingMapper.selectOne(any())).thenReturn(recording);
        when(zlmApiClient.openMp4RecordFile("rtp", "7_42_34020000001320000001", recording.getFilePath()))
                .thenReturn(new ZlmMp4RecordDownload(new ByteArrayInputStream(new byte[]{1, 2, 3}), 3L));

        ZlmMp4RecordDownload download = recordingService.openRecordingStream(42L, "15-53-02.mp4", 0L);

        assertThat(download.contentLength()).isEqualTo(3L);
        verify(zlmApiClient).openMp4RecordFile("rtp", "7_42_34020000001320000001", recording.getFilePath());
    }
}
