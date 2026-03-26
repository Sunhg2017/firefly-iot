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
import com.songhg.firefly.iot.media.zlm.ZlmResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class VideoService {

    private static final String LIVE_APP = "live";

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

        try {
            if (streamMode == StreamMode.RTSP || streamMode == StreamMode.RTMP) {
                String sourceUrl = resolvePullSourceUrl(device, streamMode);
                ZlmResponse<Map<String, Object>> response = zlmApiClient.addStreamProxy(LIVE_APP, streamId, sourceUrl);
                if (!response.isSuccess()) {
                    throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败: " + response.getMsg());
                }
            } else if (streamMode == StreamMode.GB28181) {
                String ssrc = String.format("%010d", ThreadLocalRandom.current().nextLong(1_000_000_000L, 10_000_000_000L));
                if (!sipCommandSender.sendInvite(device, channelId, ssrc)) {
                    throw new BizException(ResultCode.STREAM_START_FAILED, "GB28181 INVITE 发送失败");
                }
            } else {
                throw new BizException(ResultCode.PARAM_ERROR, "当前接入方式暂不支持播放控制");
            }
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Start video stream failed: deviceId={}, channelId={}, mode={}", deviceId, channelId, streamMode, ex);
            throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败");
        }

        StreamSession session = new StreamSession();
        session.setTenantId(tenantId);
        session.setDeviceId(deviceId);
        session.setChannelId(channelId);
        session.setStreamId(streamId);
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl(zlmApiClient.buildFlvUrl(LIVE_APP, streamId));
        session.setHlsUrl(zlmApiClient.buildHlsUrl(LIVE_APP, streamId));
        session.setWebrtcUrl(zlmApiClient.buildWebrtcUrl(LIVE_APP, streamId));
        session.setStartedAt(LocalDateTime.now());
        streamSessionMapper.insert(session);

        log.info("Stream started: deviceId={}, channelId={}, streamId={}, mode={}", deviceId, channelId, streamId, streamMode);
        return toSessionVO(session);
    }

    @Transactional
    public void stopStream(Long deviceId) {
        InternalVideoDeviceVO device = videoDeviceFacade.requireVideoDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);

        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getDeviceId, deviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE);
        for (StreamSession session : streamSessionMapper.selectList(wrapper)) {
            try {
                if (streamMode == StreamMode.GB28181) {
                    sipCommandSender.sendBye(device, session.getChannelId());
                }
                zlmApiClient.closeStream(LIVE_APP, session.getStreamId(), null);
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
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流，请先开始播放");
        try {
            String rtspUrl = zlmApiClient.buildRtspUrl(LIVE_APP, session.getStreamId());
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
        requireOnlineDevice(deviceId);
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流，请先开始播放");
        try {
            ZlmResponse<Map<String, Object>> response = zlmApiClient.startRecord(LIVE_APP, session.getStreamId(), 1);
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
        videoDeviceFacade.requireVideoDevice(deviceId);
        StreamSession session = requireLatestActiveSession(deviceId, "无活跃的视频流");
        try {
            ZlmResponse<Map<String, Object>> response = zlmApiClient.stopRecord(LIVE_APP, session.getStreamId(), 1);
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

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
