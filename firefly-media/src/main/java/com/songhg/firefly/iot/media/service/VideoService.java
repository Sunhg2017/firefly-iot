package com.songhg.firefly.iot.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.config.ZlmProperties;
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
import com.songhg.firefly.iot.media.zlm.ZlmStreamProxyInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
    private final ZlmProperties zlmProperties;
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
        StreamSession reusableSession = reuseOrRecoverActiveSession(device, streamMode, deviceId, channelId, streamId, streamApp);
        if (reusableSession != null) {
            return toSessionVO(reusableSession);
        }
        boolean gb28181RtpServerOpened = false;
        ProxyBootstrapResult proxyBootstrapResult = null;

        try {
            if (isProxyStreamMode(streamMode)) {
                String sourceUrl = resolvePullSourceUrl(device, streamMode);
                proxyBootstrapResult = openProxyStream(streamApp, streamId, sourceUrl);
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
            if (proxyBootstrapResult != null && proxyBootstrapResult.isCleanupOnFailure()) {
                safeCleanupProxyStreamResources(streamApp, streamId, proxyBootstrapResult.getProxyKey(), "start-failed");
            }
            if (gb28181RtpServerOpened) {
                releaseGb28181RtpServer(streamId);
            }
            throw ex;
        } catch (Exception ex) {
            if (proxyBootstrapResult != null && proxyBootstrapResult.isCleanupOnFailure()) {
                safeCleanupProxyStreamResources(streamApp, streamId, proxyBootstrapResult.getProxyKey(), "start-failed");
            }
            if (gb28181RtpServerOpened) {
                releaseGb28181RtpServer(streamId);
            }
            log.error("Start video stream failed: deviceId={}, channelId={}, mode={}", deviceId, channelId, streamMode, ex);
            throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败");
        }

        StreamSession session = persistActiveSession(
                tenantId,
                deviceId,
                channelId,
                streamId,
                streamApp,
                proxyBootstrapResult == null ? null : proxyBootstrapResult.getProxyKey());

        log.info("Stream started: deviceId={}, channelId={}, streamId={}, app={}, mode={}",
                deviceId, channelId, streamId, streamApp, streamMode);
        return toSessionVO(session);
    }

    @Transactional
    public void stopStream(Long deviceId) {
        InternalVideoDeviceVO device = videoDeviceFacade.requireVideoDevice(deviceId);
        StreamMode streamMode = videoDeviceFacade.requireStreamMode(device);
        String streamApp = resolveStreamApp(streamMode);
        closeSessions(device, streamMode, streamApp, listActiveSessions(deviceId, null), "manual-stop");
    }

    @Transactional
    public boolean cleanupProxyStreamOnNoReader(String app, String streamId) {
        if (!LIVE_APP.equals(app)) {
            return false;
        }
        List<StreamSession> activeSessions = listActiveSessionsByStreamId(streamId);
        cleanupProxyStreamResources(app, streamId, firstProxyKey(activeSessions), "hook-none-reader");
        markSessionsClosed(activeSessions);
        return true;
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
        StreamSession session = findLatestActiveSession(deviceId, null);
        if (session == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return session;
    }

    /**
     * ZLM stream IDs are deterministic per device/channel, so repeated play requests should reuse the
     * existing runtime stream instead of reopening a proxy/RTP server and hitting "This stream already exists".
     */
    private StreamSession reuseOrRecoverActiveSession(
            InternalVideoDeviceVO device,
            StreamMode streamMode,
            Long deviceId,
            String channelId,
            String streamId,
            String streamApp) {
        List<StreamSession> activeSessions = listActiveSessions(deviceId, streamId);
        if (isStreamReady(streamApp, streamId)) {
            if (!activeSessions.isEmpty()) {
                StreamSession session = activeSessions.getFirst();
                backfillProxyKeyIfMissing(session, streamMode, streamApp);
                log.info("Reuse existing video stream session: deviceId={}, channelId={}, streamId={}, app={}, mode={}",
                        deviceId, channelId, streamId, streamApp, streamMode);
                return session;
            }
            log.warn("Recover active video stream session from live runtime: deviceId={}, channelId={}, streamId={}, app={}, mode={}",
                    deviceId, channelId, streamId, streamApp, streamMode);
            return persistActiveSession(
                    resolveTenantId(device),
                    deviceId,
                    channelId,
                    streamId,
                    streamApp,
                    resolveStreamProxyKeySafely(streamMode, streamApp, streamId, "recover-runtime"));
        }
        if (!activeSessions.isEmpty()) {
            log.warn("Close stale video stream sessions before restart: deviceId={}, channelId={}, streamId={}, count={}, mode={}",
                    deviceId, channelId, streamId, activeSessions.size(), streamMode);
            closeSessions(device, streamMode, streamApp, activeSessions, "stale-restart");
        }
        return null;
    }

    private StreamSession persistActiveSession(
            Long tenantId,
            Long deviceId,
            String channelId,
            String streamId,
            String streamApp,
            String proxyKey) {
        StreamSession session = new StreamSession();
        session.setTenantId(tenantId);
        session.setDeviceId(deviceId);
        session.setChannelId(channelId);
        session.setStreamId(streamId);
        session.setProxyKey(proxyKey);
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl(zlmApiClient.buildFlvUrl(streamApp, streamId));
        session.setHlsUrl(zlmApiClient.buildHlsUrl(streamApp, streamId));
        session.setWebrtcUrl(zlmApiClient.buildWebrtcUrl(streamApp, streamId));
        session.setStartedAt(LocalDateTime.now());
        streamSessionMapper.insert(session);
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
        if (sourceUrl == null) {
            String host = trimToNull(device.getIp());
            if (host == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "视频源地址不能为空");
            }
            int port = device.getPort() != null
                    ? device.getPort()
                    : (streamMode == StreamMode.RTMP ? 1935 : 554);
            String protocol = streamMode == StreamMode.RTMP ? "rtmp" : "rtsp";
            sourceUrl = protocol + "://" + host + ":" + port + "/";
        }
        String validatedSourceUrl = validateProxySourceUrl(sourceUrl, streamMode);
        if (isManagedLocalProxySource(validatedSourceUrl)) {
            if (!Boolean.TRUE.equals(device.getAuthEnabled())) {
                throw new BizException(ResultCode.PARAM_ERROR, "本地摄像头推流必须启用认证");
            }
            return appendQueryAuth(validatedSourceUrl,
                    requireAuthUsername(device, "本地摄像头推流缺少认证用户名"),
                    requireAuthPassword(device, "本地摄像头推流缺少认证密码"));
        }
        if (Boolean.TRUE.equals(device.getAuthEnabled())) {
            return appendUserInfoAuth(validatedSourceUrl,
                    requireAuthUsername(device, "已启用认证时必须填写认证用户名"),
                    requireAuthPassword(device, "已启用认证时必须填写认证密码"));
        }
        return validatedSourceUrl;
    }

    /**
     * ZLM 的 addStreamProxy 只负责创建 PlayerProxy 任务，返回 "This stream already exists" 时
     * 不能仅靠等待 runtime 恢复，需要把残留代理任务删掉后再重建。
     */
    private ProxyBootstrapResult openProxyStream(String streamApp, String streamId, String sourceUrl) {
        ZlmResponse<Map<String, Object>> response = zlmApiClient.addStreamProxy(streamApp, streamId, sourceUrl);
        if (response.isSuccess()) {
            return new ProxyBootstrapResult(resolveAddedProxyKey(streamApp, streamId, response), true);
        }
        if (isStreamAlreadyExists(response)) {
            if (isStreamReady(streamApp, streamId)) {
                log.info("Reuse proxy stream after addStreamProxy conflict because runtime is already ready: app={}, streamId={}",
                        streamApp, streamId);
                return new ProxyBootstrapResult(resolveStreamProxyKeySafely(StreamMode.RTSP, streamApp, streamId, "proxy-conflict-reuse"), false);
            }
            String staleProxyKey = findStreamProxyKey(streamApp, streamId);
            if (staleProxyKey != null) {
                log.warn("Delete stale ZLM proxy before retry: app={}, streamId={}, proxyKey={}, sourceUrl={}",
                        streamApp, streamId, staleProxyKey, sanitizeSourceUrl(sourceUrl));
                deleteStreamProxy(staleProxyKey, streamApp, streamId, "proxy-conflict-retry");
                ZlmResponse<Map<String, Object>> retryResponse = zlmApiClient.addStreamProxy(streamApp, streamId, sourceUrl);
                if (retryResponse.isSuccess()) {
                    return new ProxyBootstrapResult(resolveAddedProxyKey(streamApp, streamId, retryResponse), true);
                }
                if (isStreamAlreadyExists(retryResponse) && isStreamReady(streamApp, streamId)) {
                    log.info("Reuse proxy stream after retry conflict because runtime became ready: app={}, streamId={}",
                            streamApp, streamId);
                    return new ProxyBootstrapResult(resolveStreamProxyKeySafely(StreamMode.RTSP, streamApp, streamId, "proxy-retry-conflict-reuse"), false);
                }
                throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败: " + retryResponse.getMsg());
            }
            log.warn("ZLM reported an existing proxy stream but listStreamProxy returned nothing: app={}, streamId={}, sourceUrl={}",
                    streamApp, streamId, sanitizeSourceUrl(sourceUrl));
        }
        throw new BizException(ResultCode.STREAM_START_FAILED, "视频流启动失败: " + response.getMsg());
    }

    private boolean isStreamAlreadyExists(ZlmResponse<?> response) {
        String message = trimToNull(response == null ? null : response.getMsg());
        return message != null && message.toLowerCase().contains("stream already exists");
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

    private boolean isProxyStreamMode(StreamMode streamMode) {
        return streamMode == StreamMode.RTSP || streamMode == StreamMode.RTMP;
    }

    private List<StreamSession> listActiveSessions(Long deviceId, String streamId) {
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getDeviceId, deviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt);
        if (streamId != null) {
            wrapper.eq(StreamSession::getStreamId, streamId);
        }
        return streamSessionMapper.selectList(wrapper);
    }

    private List<StreamSession> listActiveSessionsByStreamId(String streamId) {
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getStreamId, streamId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt);
        return streamSessionMapper.selectList(wrapper);
    }

    private StreamSession findLatestActiveSession(Long deviceId, String streamId) {
        List<StreamSession> sessions = listActiveSessions(deviceId, streamId);
        return sessions.isEmpty() ? null : sessions.getFirst();
    }

    private int openGb28181RtpServer(InternalVideoDeviceVO device, String streamId) {
        int tcpMode = "TCP".equalsIgnoreCase(trimToNull(device.getTransport())) ? 1 : 0;
        ZlmOpenRtpServerResponse response = zlmApiClient.openRtpServer(zlmProperties.getRtpPort(), tcpMode, streamId);
        if (response == null || !response.isSuccess()) {
            if (response != null) {
                log.warn("GB28181 openRtpServer returned unexpected response: streamId={}, code={}, msg={}, portValue={}, data={}",
                        streamId, response.getCode(), response.getMsg(), response.resolvePortValue(), response.getData());
            }
            throw new BizException(ResultCode.STREAM_START_FAILED,
                    "GB28181 RTP 收流端口打开失败: "
                            + (response == null ? "empty response"
                            : ("code=" + response.getCode() + ", msg=" + response.getMsg())));
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

    private void closeSessions(
            InternalVideoDeviceVO device,
            StreamMode streamMode,
            String streamApp,
            List<StreamSession> sessions,
            String reason) {
        for (StreamSession session : sessions) {
            closeSession(device, streamMode, streamApp, session, reason);
        }
    }

    private void closeSession(
            InternalVideoDeviceVO device,
            StreamMode streamMode,
            String streamApp,
            StreamSession session,
            String reason) {
        try {
            if (streamMode == StreamMode.GB28181) {
                sipCommandSender.sendBye(device, session.getChannelId());
                releaseGb28181RtpServer(session.getStreamId());
                closeStreamRuntime(streamApp, session.getStreamId(), reason, session.getDeviceId());
            } else if (isProxyStreamMode(streamMode)) {
                cleanupProxyStreamResources(streamApp, session.getStreamId(), session.getProxyKey(), reason);
            } else {
                closeStreamRuntime(streamApp, session.getStreamId(), reason, session.getDeviceId());
            }
        } catch (Exception ex) {
            log.warn("Close stream runtime cleanup failed: reason={}, deviceId={}, streamId={}, error={}",
                    reason, session.getDeviceId(), session.getStreamId(), ex.getMessage());
        }
        markSessionClosed(session);
    }

    private void cleanupProxyStreamResources(String streamApp, String streamId, String proxyKey, String reason) {
        String resolvedProxyKey = trimToNull(proxyKey);
        if (resolvedProxyKey == null) {
            resolvedProxyKey = findStreamProxyKey(streamApp, streamId);
        }
        if (resolvedProxyKey != null) {
            deleteStreamProxy(resolvedProxyKey, streamApp, streamId, reason);
        }
        closeStreamRuntime(streamApp, streamId, reason, null);
    }

    private void safeCleanupProxyStreamResources(String streamApp, String streamId, String proxyKey, String reason) {
        try {
            cleanupProxyStreamResources(streamApp, streamId, proxyKey, reason);
        } catch (Exception ex) {
            log.warn("Cleanup proxy stream failed after start error: reason={}, streamId={}, error={}",
                    reason, streamId, ex.getMessage());
        }
    }

    private void deleteStreamProxy(String proxyKey, String streamApp, String streamId, String reason) {
        ZlmResponse<Map<String, Object>> response = zlmApiClient.delStreamProxy(proxyKey);
        if (response != null && !response.isSuccess()) {
            log.warn("Delete stream proxy returned non-success: reason={}, app={}, streamId={}, proxyKey={}, msg={}",
                    reason, streamApp, streamId, proxyKey, response.getMsg());
            return;
        }
        Object flag = response == null || response.getData() == null ? null : response.getData().get("flag");
        if (Boolean.FALSE.equals(flag)) {
            log.info("Stream proxy was already removed before cleanup: reason={}, app={}, streamId={}, proxyKey={}",
                    reason, streamApp, streamId, proxyKey);
        }
    }

    private void closeStreamRuntime(String streamApp, String streamId, String reason, Long deviceId) {
        ZlmResponse<Map<String, Object>> response = zlmApiClient.closeStream(streamApp, streamId, null);
        if (response != null && !response.isSuccess()) {
            log.warn("Close stream returned non-success: reason={}, deviceId={}, streamId={}, msg={}",
                    reason, deviceId, streamId, response.getMsg());
        }
    }

    private String findStreamProxyKey(String streamApp, String streamId) {
        ZlmResponse<List<ZlmStreamProxyInfo>> response = zlmApiClient.listStreamProxy();
        if (response == null || !response.isSuccess()) {
            throw new BizException(ResultCode.INTERNAL_ERROR,
                    "查询 ZLM 代理任务失败: " + (response == null ? "empty response" : response.getMsg()));
        }
        List<ZlmStreamProxyInfo> proxies = response.getData();
        if (proxies == null || proxies.isEmpty()) {
            return null;
        }
        for (ZlmStreamProxyInfo proxy : proxies) {
            if (streamApp.equals(trimToNull(proxy.resolveApp())) && streamId.equals(trimToNull(proxy.resolveStream()))) {
                return trimToNull(proxy.getKey());
            }
        }
        return null;
    }

    private String resolveAddedProxyKey(String streamApp, String streamId, ZlmResponse<Map<String, Object>> response) {
        Map<String, Object> data = response == null ? null : response.getData();
        Object rawProxyKey = data == null ? null : data.get("key");
        String proxyKey = rawProxyKey == null ? null : trimToNull(String.valueOf(rawProxyKey));
        if (proxyKey != null) {
            return proxyKey;
        }
        String discoveredProxyKey = resolveStreamProxyKeySafely(StreamMode.RTSP, streamApp, streamId, "add-proxy-missing-key");
        if (discoveredProxyKey == null) {
            log.warn("ZLM addStreamProxy succeeded but no proxy key was returned: app={}, streamId={}", streamApp, streamId);
        }
        return discoveredProxyKey;
    }

    private String resolveStreamProxyKeySafely(StreamMode streamMode, String streamApp, String streamId, String reason) {
        if (!isProxyStreamMode(streamMode)) {
            return null;
        }
        try {
            return findStreamProxyKey(streamApp, streamId);
        } catch (Exception ex) {
            log.warn("Resolve stream proxy key failed: reason={}, app={}, streamId={}, error={}",
                    reason, streamApp, streamId, ex.getMessage());
            return null;
        }
    }

    private void backfillProxyKeyIfMissing(StreamSession session, StreamMode streamMode, String streamApp) {
        if (!isProxyStreamMode(streamMode) || trimToNull(session.getProxyKey()) != null) {
            return;
        }
        String proxyKey = resolveStreamProxyKeySafely(streamMode, streamApp, session.getStreamId(), "reuse-session-backfill");
        if (proxyKey == null) {
            return;
        }
        session.setProxyKey(proxyKey);
        streamSessionMapper.updateById(session);
    }

    private String firstProxyKey(List<StreamSession> sessions) {
        for (StreamSession session : sessions) {
            String proxyKey = trimToNull(session.getProxyKey());
            if (proxyKey != null) {
                return proxyKey;
            }
        }
        return null;
    }

    private void markSessionsClosed(List<StreamSession> sessions) {
        for (StreamSession session : sessions) {
            markSessionClosed(session);
        }
    }

    private void markSessionClosed(StreamSession session) {
        session.setStatus(StreamStatus.CLOSED);
        session.setStoppedAt(LocalDateTime.now());
        streamSessionMapper.updateById(session);
    }

    private String validateProxySourceUrl(String sourceUrl, StreamMode streamMode) {
        String normalizedSourceUrl = trimToNull(sourceUrl);
        if (normalizedSourceUrl == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址不能为空");
        }
        String expectedScheme = streamMode == StreamMode.RTMP ? "rtmp" : "rtsp";
        try {
            URI parsed = new URI(normalizedSourceUrl);
            String scheme = trimToNull(parsed.getScheme());
            if (scheme == null || !expectedScheme.equalsIgnoreCase(scheme)) {
                throw new BizException(ResultCode.PARAM_ERROR, "视频源地址必须使用 " + expectedScheme + "://");
            }
            if (trimToNull(parsed.getUserInfo()) != null) {
                throw new BizException(ResultCode.PARAM_ERROR, "视频源地址不能内嵌用户名密码，请改填独立认证字段");
            }
            if (trimToNull(parsed.getHost()) == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "视频源地址缺少主机地址");
            }
            int resolvedPort = parsed.getPort() == -1
                    ? (streamMode == StreamMode.RTMP ? 1935 : 554)
                    : parsed.getPort();
            if (resolvedPort <= 0 || resolvedPort > 65535) {
                throw new BizException(ResultCode.PARAM_ERROR, "视频源地址端口不正确");
            }
            return normalizedSourceUrl;
        } catch (URISyntaxException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址格式不正确");
        }
    }

    private boolean isManagedLocalProxySource(String sourceUrl) {
        String normalizedSourceUrl = trimToNull(sourceUrl);
        if (normalizedSourceUrl == null) {
            return false;
        }
        try {
            URI parsed = new URI(normalizedSourceUrl);
            String path = trimToNull(parsed.getPath());
            return path != null && path.startsWith("/live/simcam-");
        } catch (URISyntaxException ex) {
            return false;
        }
    }

    private String appendUserInfoAuth(String sourceUrl, String username, String password) {
        try {
            URI parsed = new URI(sourceUrl);
            int resolvedPort = parsed.getPort();
            return new URI(parsed.getScheme(), username + ":" + password, parsed.getHost(), resolvedPort,
                    parsed.getPath(), parsed.getQuery(), parsed.getFragment()).toString();
        } catch (URISyntaxException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址格式不正确");
        }
    }

    private String appendQueryAuth(String sourceUrl, String username, String password) {
        try {
            URI parsed = new URI(sourceUrl);
            String encodedUser = URLEncoder.encode(username, StandardCharsets.UTF_8);
            String encodedPassword = URLEncoder.encode(password, StandardCharsets.UTF_8);
            String rawQuery = trimToNull(parsed.getRawQuery());
            String authQuery = "authUser=" + encodedUser + "&authPass=" + encodedPassword;
            String nextQuery = rawQuery == null ? authQuery : rawQuery + "&" + authQuery;
            return new URI(parsed.getScheme(), parsed.getRawAuthority(), parsed.getRawPath(), nextQuery, parsed.getRawFragment())
                    .toString();
        } catch (URISyntaxException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址格式不正确");
        }
    }

    private String requireAuthUsername(InternalVideoDeviceVO device, String message) {
        String authUsername = trimToNull(device.getAuthUsername());
        if (authUsername == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return authUsername;
    }

    private String requireAuthPassword(InternalVideoDeviceVO device, String message) {
        String authPassword = trimToNull(device.getAuthPassword());
        if (authPassword == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return authPassword;
    }

    private String sanitizeSourceUrl(String sourceUrl) {
        String normalizedSourceUrl = trimToNull(sourceUrl);
        if (normalizedSourceUrl == null) {
            return null;
        }
        return normalizedSourceUrl
                .replaceAll("(?i)(://)([^/@]+)@", "$1***@")
                .replaceAll("(?i)(authUser=)[^&]+", "$1***")
                .replaceAll("(?i)(authPass=)[^&]+", "$1***");
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

    private static final class ProxyBootstrapResult {

        private final String proxyKey;
        private final boolean cleanupOnFailure;

        private ProxyBootstrapResult(String proxyKey, boolean cleanupOnFailure) {
            this.proxyKey = proxyKey;
            this.cleanupOnFailure = cleanupOnFailure;
        }

        private String getProxyKey() {
            return proxyKey;
        }

        private boolean isCleanupOnFailure() {
            return cleanupOnFailure;
        }
    }
}
