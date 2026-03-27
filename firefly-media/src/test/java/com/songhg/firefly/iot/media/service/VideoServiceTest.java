package com.songhg.firefly.iot.media.service;

import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.media.config.ZlmProperties;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.gb28181.SipCommandSender;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import com.songhg.firefly.iot.media.zlm.ZlmOpenRtpServerResponse;
import com.songhg.firefly.iot.media.zlm.ZlmResponse;
import com.songhg.firefly.iot.media.zlm.ZlmStreamInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VideoServiceTest {

    @Mock
    private VideoDeviceFacade videoDeviceFacade;
    @Mock
    private StreamSessionMapper streamSessionMapper;
    @Mock
    private ZlmApiClient zlmApiClient;
    @Mock
    private ZlmProperties zlmProperties;
    @Mock
    private FileClient fileClient;
    @Mock
    private SipCommandSender sipCommandSender;

    private VideoService videoService;

    @BeforeEach
    void setUp() {
        videoService = new VideoService(
                videoDeviceFacade,
                streamSessionMapper,
                zlmApiClient,
                zlmProperties,
                fileClient,
                sipCommandSender
        );
    }

    @Test
    void startStreamReusesExistingGb28181SessionWhenMediaIsStillReady() {
        Long deviceId = 12L;
        InternalVideoDeviceVO device = buildGbDevice(deviceId, 2L);
        StreamSession existingSession = buildActiveSession(deviceId, 2L, null, "2_12_0");

        when(videoDeviceFacade.requireVideoDevice(deviceId)).thenReturn(device);
        when(videoDeviceFacade.isOnline(device)).thenReturn(true);
        when(videoDeviceFacade.requireStreamMode(device)).thenReturn(StreamMode.GB28181);
        when(streamSessionMapper.selectList(any())).thenReturn(List.of(existingSession));
        when(zlmApiClient.getMediaList("rtp", "2_12_0", null)).thenReturn(successMediaList(List.of(new ZlmStreamInfo())));

        StreamSessionVO result = videoService.startStream(deviceId, new StreamStartDTO());

        assertThat(result.getStreamId()).isEqualTo("2_12_0");
        assertThat(result.getFlvUrl()).isEqualTo(existingSession.getFlvUrl());
        assertThat(result.getStatus()).isEqualTo(StreamStatus.ACTIVE);
        verify(zlmApiClient, never()).openRtpServer(anyInt(), anyInt(), anyString());
        verify(sipCommandSender, never()).sendInvite(any(), any(), anyString(), anyInt());
        verify(streamSessionMapper, never()).insert(any(StreamSession.class));
    }

    @Test
    void startStreamClosesStaleGb28181SessionBeforeRestarting() {
        Long deviceId = 12L;
        InternalVideoDeviceVO device = buildGbDevice(deviceId, 2L);
        StreamSession staleSession = buildActiveSession(deviceId, 2L, null, "2_12_0");

        when(videoDeviceFacade.requireVideoDevice(deviceId)).thenReturn(device);
        when(videoDeviceFacade.isOnline(device)).thenReturn(true);
        when(videoDeviceFacade.requireStreamMode(device)).thenReturn(StreamMode.GB28181);
        when(streamSessionMapper.selectList(any())).thenReturn(List.of(staleSession));
        when(zlmApiClient.getMediaList("rtp", "2_12_0", null)).thenReturn(
                successMediaList(Collections.emptyList()),
                successMediaList(List.of(new ZlmStreamInfo()))
        );
        when(zlmProperties.getRtpPort()).thenReturn(10000);
        when(zlmApiClient.closeRtpServer("2_12_0")).thenReturn(successMapResponse());
        when(zlmApiClient.closeStream("rtp", "2_12_0", null)).thenReturn(successMapResponse());
        when(zlmApiClient.openRtpServer(10000, 0, "2_12_0")).thenReturn(successOpenRtpResponse(10000));
        when(sipCommandSender.sendInvite(eq(device), isNull(), anyString(), eq(10000))).thenReturn(true);
        when(zlmApiClient.buildFlvUrl("rtp", "2_12_0")).thenReturn("http://192.168.123.102:18080/rtp/2_12_0.live.flv");
        when(zlmApiClient.buildHlsUrl("rtp", "2_12_0")).thenReturn("http://192.168.123.102:18080/rtp/2_12_0/hls.m3u8");
        when(zlmApiClient.buildWebrtcUrl("rtp", "2_12_0")).thenReturn("webrtc://192.168.123.102/rtp/2_12_0");

        StreamSessionVO result = videoService.startStream(deviceId, new StreamStartDTO());

        assertThat(result.getStreamId()).isEqualTo("2_12_0");
        assertThat(result.getFlvUrl()).isEqualTo("http://192.168.123.102:18080/rtp/2_12_0.live.flv");
        verify(sipCommandSender).sendBye(device, null);
        verify(zlmApiClient).closeRtpServer("2_12_0");
        verify(zlmApiClient).closeStream("rtp", "2_12_0", null);
        verify(zlmApiClient).openRtpServer(10000, 0, "2_12_0");
        verify(sipCommandSender).sendInvite(eq(device), isNull(), anyString(), eq(10000));

        ArgumentCaptor<StreamSession> closedSessionCaptor = ArgumentCaptor.forClass(StreamSession.class);
        verify(streamSessionMapper).updateById(closedSessionCaptor.capture());
        assertThat(closedSessionCaptor.getValue().getStatus()).isEqualTo(StreamStatus.CLOSED);
        assertThat(closedSessionCaptor.getValue().getStoppedAt()).isNotNull();

        ArgumentCaptor<StreamSession> createdSessionCaptor = ArgumentCaptor.forClass(StreamSession.class);
        verify(streamSessionMapper).insert(createdSessionCaptor.capture());
        StreamSession createdSession = createdSessionCaptor.getValue();
        assertThat(createdSession.getStreamId()).isEqualTo("2_12_0");
        assertThat(createdSession.getStatus()).isEqualTo(StreamStatus.ACTIVE);
        assertThat(createdSession.getFlvUrl()).isEqualTo("http://192.168.123.102:18080/rtp/2_12_0.live.flv");
    }

    private InternalVideoDeviceVO buildGbDevice(Long deviceId, Long tenantId) {
        InternalVideoDeviceVO device = new InternalVideoDeviceVO();
        device.setDeviceId(deviceId);
        device.setTenantId(tenantId);
        device.setStreamMode(StreamMode.GB28181.getValue());
        device.setStatus("ONLINE");
        device.setTransport("UDP");
        device.setGbDeviceId("34020000001");
        return device;
    }

    private StreamSession buildActiveSession(Long deviceId, Long tenantId, String channelId, String streamId) {
        StreamSession session = new StreamSession();
        session.setId(1L);
        session.setTenantId(tenantId);
        session.setDeviceId(deviceId);
        session.setChannelId(channelId);
        session.setStreamId(streamId);
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl("http://192.168.123.102:18080/rtp/2_12_0.live.flv");
        session.setHlsUrl("http://192.168.123.102:18080/rtp/2_12_0/hls.m3u8");
        session.setWebrtcUrl("webrtc://192.168.123.102/rtp/2_12_0");
        session.setStartedAt(LocalDateTime.now().minusMinutes(5));
        return session;
    }

    private ZlmResponse<List<ZlmStreamInfo>> successMediaList(List<ZlmStreamInfo> streams) {
        ZlmResponse<List<ZlmStreamInfo>> response = new ZlmResponse<>();
        response.setCode(0);
        response.setData(streams);
        return response;
    }

    private ZlmResponse<Map<String, Object>> successMapResponse() {
        ZlmResponse<Map<String, Object>> response = new ZlmResponse<>();
        response.setCode(0);
        response.setData(Map.of());
        return response;
    }

    private ZlmOpenRtpServerResponse successOpenRtpResponse(int port) {
        ZlmOpenRtpServerResponse response = new ZlmOpenRtpServerResponse();
        response.setCode(0);
        response.setPort(port);
        return response;
    }
}
