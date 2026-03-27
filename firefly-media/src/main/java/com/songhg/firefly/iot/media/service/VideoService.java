package com.songhg.firefly.iot.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.dto.video.PtzControlDTO;
import com.songhg.firefly.iot.media.dto.video.RecordingVO;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.gb28181.SipCommandSender;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import com.songhg.firefly.iot.media.zlm.ZlmOpenRtpServerResponse;
import com.songhg.firefly.iot.media.zlm.ZlmResponse;
import com.songhg.firefly.iot.media.zlm.ZlmStreamInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class VideoService {

    private static final String LIVE_APP = "live";
    private static final String RTP_APP = "rtp";
    private static final long STREAM_READY_TIMEOUT_MS = 8000L;
    private static final long STREAM_READY_POLL_INTERVAL_MS = 300L;

    private final VideoDeviceFacade videoDeviceFacade;
    private final StreamSessionMapper streamSessionMapper;
    private final ZlmApiClient zlmApiClient;
    private final FileClient fileClient;
    private final SipCommandSender sipCommandSender;

    public void queryCatalog(Long deviceId) {
        InternalVideoDeviceVO device = requireGb28181OnlineDevice(deviceId);
        sipCommandSender.queryCatalog(device);
    }

    public void queryDeviceInfo(Long deviceId) {
        InternalVideoDeviceVO device = requireGb28181OnlineDevice(deviceId);
        sipCommandSender.queryDeviceInfo(device);
    }

    @Transactional
    public StreamSessionVO startStream(Long deviceId, StreamStartDTO dto) {
        InternalVideoDeviceVO device = requireOnlineDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        String channelId = trimToNull(dto == null ? null : dto.getChannelId());
        Long tenantId = resolveTenantId(device);
        String streamId = buildStreamId(tenantId, deviceId, channelId);
        String streamApp = resolveStreamApp(streamMode);
        boolean gb28181RtpServerOpened = false;

        try {
            if (streamMode == StreamMode.RTSP || streamMode == StreamMode.RTMP) {
                String sourceUrl = resolvePullSourceUrl(device, streamMode);
                ZlmResponse<Map<String, Object>> response = zlmApiClient.addStreamProxy(streamApp, streamId, sourceUrl);
                if (!response.isSuccess()) {
                    throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败: " + response.getMsg());
                }
            } else if (streamMode == StreamMode.GB28181) {
                int rtpPort = openGb28181RtpServer(device, streamId);
                gb28181RtpServerOpened = true;
                String ssrc = String.format("%010d", ThreadLocalRandom.current().nextLong(1_000_000_000L, 10_000_000_000L));
                if (!sipCommandSender.sendInvite(device, channelId, ssrc, rtpPort)) {
                    throw new BizException(ResultCode.STREAM_START_FAILED, "GB28181 INVITE 发送失败");
                }
            } else {
                throw new BizException(ResultCode.PARAM_ERROR, "当前接入方式暂不支持播放控制");
            }
            waitUntilStreamReady(streamApp, streamId, streamMode);
        } catch (BizException ex) {
            if (gb28181RtpServerOpened) {
                releaseGb28181RtpServer(streamId);
            }
            throw ex;
        } catch (Exception ex) {
            if (gb28181RtpServerOpened) {
                releaseGb28181RtpServer(streamId);
            }
            log.error("Start video stream failed: deviceId={}, channelId={}, mode={}", deviceId, channelId, streamMode, ex);
            throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败");
        }

        StreamSession session = new StreamSession();
        session.setTenantId(tenantId);
        session.setDeviceId(deviceId);
        session.setChannelId(channelId);
        session.setStreamId(streamId);
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl(zlmApiClient.buildFlvUrl(streamApp, streamId));
        session.setHlsUrl(zlmApiClient.buildHlsUrl(streamApp, streamId));
        session.setWebrtcUrl(zlmApiClient.buildWebrtcUrl(streamApp, streamId));
        session.setStartedAt(LocalDateTime.now());
        streamSessionMapper.insert(session);

        log.info("Stream started: deviceId={}, channelId={}, streamId={}, app={}, mode={}",
                deviceId, channelId, streamId, streamApp, streamMode);
        return toSessionVO(session);
    }

    @Transactional
    public void stopStream(Long deviceId) {
        InternalVideoDeviceVO device = videoDeviceFacade.requireVideoDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);

        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getDeviceId, deviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE);
        String streamApp = resolveStreamApp(streamMode);
        for (StreamSession session : streamSessionMapper.selectList(wrapper)) {
            try {
                if (streamMode == StreamMode.GB28181) {
                    sipCommandSender.sendBye(device, session.getChannelId());
                    releaseGb28181RtpServer(session.getStreamId());
                }
                zlmApiClient.closeStream(streamApp, session.getStreamId(), null);
            } catch (Exception ex) {
                log.warn("Stop stream runtime cleanup failed: deviceId={}, streamId={}, error={}",
                        deviceId, session.getStreamId(), ex.getMessage());
            }
            session.setStatus(StreamStatus.CLOSED);
            session.setStoppedAt(LocalDateTime.now());
            streamSessionMapper.updateById(session);
        }
    }

    public void ptzControl(Long deviceId, PtzControlDTO dto) {
        InternalVideoDeviceVO device = requireOnlineDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        if (streamMode != StreamMode.GB28181) {
            throw new BizException(ResultCode.PARAM_ERROR, "当前接入方式暂不支持 PTZ 控制");
        }
        int speed = dto.getSpeed() == null ? 128 : dto.getSpeed();
        sipCommandSender.sendPtzControl(device, dto.getChannelId(), dto.getCommand(), speed);
    }

    public String snapshot(Long deviceId) {
        InternalVideoDeviceVO device = requireOnlineDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流，请先开始播放");
        try {
            String rtspUrl = zlmApiClient.buildRtspUrl(resolveStreamApp(streamMode), session.getStreamId());
            byte[] snapData = zlmApiClient.getSnap(rtspUrl, 10, 3);
            if (snapData == null || snapData.length == 0) {
                throw new BizException(ResultCode.PARAM_ERROR, "截图失败");
            }
            String objectName = resolveTenantId(device) + "/video/" + deviceId
                    + "/snapshot_" + System.currentTimeMillis() + ".jpg";
            Map<String, String> data = fileClient.uploadBytes(objectName, "image/jpeg", snapData).getData();
            String imageUrl = data == null ? null : trimToNull(data.get("url"));
            if (imageUrl == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "截图上传失败");
            }
            return imageUrl;
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Take snapshot failed: deviceId={}, streamId={}", deviceId, session.getStreamId(), ex);
            throw new BizException(ResultCode.PARAM_ERROR, "截图失败");
        }
    }

    public RecordingVO startRecording(Long deviceId) {
        InternalVideoDeviceVO device = requireOnlineDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流，请先开始播放");
        try {
            ZlmResponse<Map<String, Object>> response = zlmApiClient.startRecord(
                    resolveStreamApp(streamMode),
                    session.getStreamId(),
                    1
            );
            if (!response.isSuccess()) {
                throw new BizException(ResultCode.PARAM_ERROR, "开始录像失败: " + response.getMsg());
            }
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Start recording failed: deviceId={}, streamId={}", deviceId, session.getStreamId(), ex);
            throw new BizException(ResultCode.PARAM_ERROR, "开始录像失败");
        }
        return toRecordingVO(deviceId, session.getStreamId(), true, LocalDateTime.now(), null);
    }

    public RecordingVO stopRecording(Long deviceId) {
        InternalVideoDeviceVO device = videoDeviceFacade.requireVideoDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流");
        try {
            ZlmResponse<Map<String, Object>> response = zlmApiClient.stopRecord(
                    resolveStreamApp(streamMode),
                    session.getStreamId(),
                    1
            );
            if (!response.isSuccess()) {
                log.warn("Stop recording returned non-success: deviceId={}, streamId={}, msg={}",
                        deviceId, session.getStreamId(), response.getMsg());
            }
        } catch (Exception ex) {
            log.warn("Stop recording runtime cleanup failed: deviceId={}, streamId={}, error={}",
                    deviceId, session.getStreamId(), ex.getMessage());
        }
        return toRecordingVO(deviceId, session.getStreamId(), false, null, LocalDateTime.now());
    }

    private InternalVideoDeviceVO requireOnlineDevice(Long deviceId) {
        InternalVideoDeviceVO device = videoDeviceFacade.requireVideoDevice(deviceId);
        if (!videoDeviceFacade.isOnline(device)) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }
        return device;
    }

    private InternalVideoDeviceVO requireGb28181OnlineDevice(Long deviceId) {
        InternalVideoDeviceVO device = requireOnlineDevice(deviceId);
        if (videoDeviceFacade.requireStreamMode(device) != StreamMode.GB28181 || trimToNull(device.getGbDeviceId()) == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "当前设备不是 GB28181 视频设备");
        }
        return device;
    }

    private StreamSession requireLatestActiveSession(Long deviceId, String message) {
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getDeviceId, deviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt)
                .last("LIMIT 1");
        StreamSession session = streamSessionMapper.selectOne(wrapper);
        if (session == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return session;
    }

    private StreamSessionVO toSessionVO(StreamSession session) {
        StreamSessionVO vo = new StreamSessionVO();
        vo.setId(session.getId());
        vo.setDeviceId(session.getDeviceId());
        vo.setChannelId(session.getChannelId());
        vo.setStreamId(session.getStreamId());
        vo.setStatus(session.getStatus());
        vo.setFlvUrl(session.getFlvUrl());
        vo.setHlsUrl(session.getHlsUrl());
        vo.setWebrtcUrl(session.getWebrtcUrl());
        vo.setStartedAt(session.getStartedAt());
        vo.setStoppedAt(session.getStoppedAt());
        return vo;
    }

    private RecordingVO toRecordingVO(
            Long deviceId,
            String streamId,
            boolean recording,
            LocalDateTime startedAt,
            LocalDateTime stoppedAt) {
        RecordingVO vo = new RecordingVO();
        vo.setDeviceId(deviceId);
        vo.setStreamId(streamId);
        vo.setRecording(recording);
        vo.setStartedAt(startedAt);
        vo.setStoppedAt(stoppedAt);
        return vo;
    }

    private String resolvePullSourceUrl(InternalVideoDeviceVO device, StreamMode streamMode) {
        String sourceUrl = trimToNull(device.getSourceUrl());
        if (sourceUrl != null) {
            return sourceUrl;
        }
        String host = trimToNull(device.getIp());
        if (host == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址不能为空");
        }
        int port = device.getPort() != null
                ? device.getPort()
                : (streamMode == StreamMode.RTMP ? 1935 : 554);
        String protocol = streamMode == StreamMode.RTMP ? "rtmp" : "rtsp";
        return protocol + "://" + host + ":" + port + "/";
    }

    private String buildStreamId(Long tenantId, Long deviceId, String channelId) {
        return (tenantId == null ? 0L : tenantId) + "_" + deviceId + "_" + (channelId == null ? "0" : channelId);
    }

    private Long resolveTenantId(InternalVideoDeviceVO device) {
        return device.getTenantId();
    }

    private String resolveStreamApp(StreamMode streamMode) {
        return streamMode == StreamMode.GB28181 ? RTP_APP : LIVE_APP;
    }

    private int openGb28181RtpServer(InternalVideoDeviceVO device, String streamId) {
        int tcpMode = "TCP".equalsIgnoreCase(trimToNull(device.getTransport())) ? 1 : 0;
        ZlmOpenRtpServerResponse response = zlmApiClient.openRtpServer(0, tcpMode, streamId);
        if (response == null || !response.isSuccess()) {
            throw new BizException(ResultCode.STREAM_START_FAILED,
                    "GB28181 RTP 收流端口打开失败: " + (response == null ? "empty response" : response.getMsg()));
        }
        Integer port = response.resolvePort();
        if (port == null || port <= 0) {
            log.warn("GB28181 RTP server port missing or invalid: streamId={}, code={}, msg={}, portValue={}, data={}",
                    streamId, response.getCode(), response.getMsg(), response.resolvePortValue(), response.getData());
            throw new BizException(ResultCode.STREAM_START_FAILED, "GB28181 RTP 收流端口返回不正确");
        }
        return port;
    }

    private void releaseGb28181RtpServer(String streamId) {
        try {
            ZlmResponse<Map<String, Object>> response = zlmApiClient.closeRtpServer(streamId);
            if (response != null && !response.isSuccess()) {
                log.warn("Close GB28181 RTP server returned non-success: streamId={}, msg={}",
                        streamId, response.getMsg());
            }
        } catch (Exception ex) {
            log.warn("Close GB28181 RTP server failed: streamId={}, error={}", streamId, ex.getMessage());
        }
    }

    private void waitUntilStreamReady(String app, String streamId, StreamMode streamMode) {
        long deadline = System.currentTimeMillis() + STREAM_READY_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (isStreamReady(app, streamId)) {
                return;
            }
            try {
                Thread.sleep(STREAM_READY_POLL_INTERVAL_MS);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new BizException(ResultCode.STREAM_START_FAILED, "等待视频流就绪被中断");
            }
        }
        throw new BizException(ResultCode.STREAM_START_FAILED,
                "视频流启动超时，请确认设备在线并且媒体服务可访问: mode=" + streamMode + ", app=" + app);
    }

    private boolean isStreamReady(String app, String streamId) {
        try {
            ZlmResponse<List<ZlmStreamInfo>> response = zlmApiClient.getMediaList(app, streamId, null);
            return response != null && response.isSuccess() && response.getData() != null && !response.getData().isEmpty();
        } catch (Exception ex) {
            log.debug("Check stream readiness failed: app={}, streamId={}, error={}", app, streamId, ex.getMessage());
            return false;
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
