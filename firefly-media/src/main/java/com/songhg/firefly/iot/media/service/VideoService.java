package com.songhg.firefly.iot.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.convert.VideoConvert;
import com.songhg.firefly.iot.media.dto.video.PtzControlDTO;
import com.songhg.firefly.iot.media.dto.video.RecordingVO;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.dto.video.VideoChannelVO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceQueryDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceUpdateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceVO;
import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.InternalDeviceCreateDTO;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.entity.VideoChannel;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.mapper.VideoChannelMapper;
import com.songhg.firefly.iot.media.mapper.VideoDeviceMapper;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.media.gb28181.SipCommandSender;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import com.songhg.firefly.iot.media.zlm.ZlmResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class VideoService {

    private static final DateTimeFormatter LINKED_DEVICE_NAME_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final VideoDeviceMapper videoDeviceMapper;
    private final VideoChannelMapper videoChannelMapper;
    private final StreamSessionMapper streamSessionMapper;
    private final ProductClient productClient;
    private final DeviceClient deviceClient;
    private final ObjectProvider<DataScopeResolver> dataScopeResolverProvider;
    private final ZlmApiClient zlmApiClient;
    private final FileClient fileClient;
    private final SipCommandSender sipCommandSender;

    // ==================== Video Device CRUD ====================

    @Transactional
    public VideoDeviceVO createDevice(VideoDeviceCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        VideoDevice device = VideoConvert.toDeviceEntity(dto);
        normalizeDevice(device, dto.getSipAuthEnabled());
        // 视频设备列表按 device_id 参与数据权限过滤，新增时必须先挂到设备资产主链路，
        // 否则保存成功后会因为 device_id 为空而立即从列表中消失。
        device.setDeviceId(resolveLinkedDeviceId(dto, device));
        device.setTenantId(tenantId);
        device.setStatus(VideoDeviceStatus.OFFLINE);
        device.setCreatedBy(AppContextHolder.getUserId());
        videoDeviceMapper.insert(device);
        log.info("Video device created: id={}, name={}, mode={}", device.getId(), dto.getName(), dto.getStreamMode());
        return VideoConvert.toDeviceVO(device);
    }

    public VideoDeviceVO getDeviceById(Long id) {
        VideoDevice device = videoDeviceMapper.selectById(id);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        return VideoConvert.toDeviceVO(device);
    }

    @DataScope(projectColumn = "", productColumn = "", deviceColumn = "device_id", groupColumn = "")
    public IPage<VideoDeviceVO> listDevices(VideoDeviceQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<VideoDevice> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<VideoDevice> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VideoDevice::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(VideoDevice::getName, query.getKeyword())
                    .or().like(VideoDevice::getGbDeviceId, query.getKeyword())
                    .or().like(VideoDevice::getIp, query.getKeyword()));
        }
        if (query.getStreamMode() != null) {
            wrapper.eq(VideoDevice::getStreamMode, query.getStreamMode());
        }
        if (query.getStatus() != null) {
            wrapper.eq(VideoDevice::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(VideoDevice::getCreatedAt);

        IPage<VideoDevice> result = videoDeviceMapper.selectPage(page, wrapper);
        return result.convert(VideoConvert::toDeviceVO);
    }

    @Transactional
    public VideoDeviceVO updateDevice(Long id, VideoDeviceUpdateDTO dto) {
        VideoDevice device = videoDeviceMapper.selectById(id);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        VideoConvert.updateDeviceEntity(dto, device);
        normalizeDevice(device, dto.getSipAuthEnabled());
        videoDeviceMapper.updateById(device);
        return VideoConvert.toDeviceVO(device);
    }

    @Transactional
    public void deleteDevice(Long id) {
        VideoDevice device = videoDeviceMapper.selectById(id);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        videoDeviceMapper.deleteById(id);
        log.info("Video device deleted: id={}", id);
    }

    // ==================== Channel Management ====================

    public List<VideoChannelVO> listChannels(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }

        LambdaQueryWrapper<VideoChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VideoChannel::getVideoDeviceId, videoDeviceId).orderByAsc(VideoChannel::getChannelId);
        return videoChannelMapper.selectList(wrapper)
                .stream().map(VideoConvert::toChannelVO).collect(Collectors.toList());
    }

    // ==================== GB28181 Queries ====================

    public void queryCatalog(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStreamMode() != StreamMode.GB28181 || device.getGbDeviceId() == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }
        sipCommandSender.queryCatalog(device);
    }

    public void queryDeviceInfo(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStreamMode() != StreamMode.GB28181 || device.getGbDeviceId() == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }
        sipCommandSender.queryDeviceInfo(device);
    }

    // ==================== Stream Control ====================

    @Transactional
    public StreamSessionVO startStream(Long videoDeviceId, StreamStartDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStatus() != VideoDeviceStatus.ONLINE) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }

        String streamId = tenantId + "_" + videoDeviceId + "_" + (dto.getChannelId() != null ? dto.getChannelId() : "0");
        String app = "live";

        // 根据接入方式调用不同的 ZLM API
        try {
            if (device.getStreamMode() == StreamMode.RTSP) {
                // RTSP 拉流代理
                String rtspUrl = "rtsp://" + device.getIp() + ":" + (device.getPort() != null ? device.getPort() : 554) + "/";
                ZlmResponse<Map<String, Object>> resp = zlmApiClient.addStreamProxy(app, streamId, rtspUrl);
                if (!resp.isSuccess()) {
                    log.error("ZLM addStreamProxy failed: {}", resp.getMsg());
                    throw new BizException(ResultCode.STREAM_START_FAILED);
                }
            } else if (device.getStreamMode() == StreamMode.GB28181) {
                // GB28181: 通过 SIP INVITE 发起实时点播
                String ssrc = String.format("%010d", (long) (Math.random() * 9000000000L + 1000000000L));
                boolean sent = sipCommandSender.sendInvite(device, dto.getChannelId(), ssrc);
                if (!sent) {
                    log.warn("GB28181 INVITE send failed, recording session anyway: device={}", device.getGbDeviceId());
                }
            }
            // RTMP: 设备主动推流到 ZLM，无需平台主动拉流
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.error("ZLM stream start error: {}", e.getMessage());
            throw new BizException(ResultCode.STREAM_START_FAILED);
        }

        StreamSession session = new StreamSession();
        session.setTenantId(tenantId);
        session.setVideoDeviceId(videoDeviceId);
        session.setChannelId(dto.getChannelId());
        session.setStreamId(streamId);
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl(zlmApiClient.buildFlvUrl(app, streamId));
        session.setHlsUrl(zlmApiClient.buildHlsUrl(app, streamId));
        session.setWebrtcUrl(zlmApiClient.buildWebrtcUrl(app, streamId));
        session.setStartedAt(LocalDateTime.now());
        streamSessionMapper.insert(session);

        log.info("Stream started: deviceId={}, streamId={}, mode={}", videoDeviceId, streamId, device.getStreamMode());
        return VideoConvert.toSessionVO(session);
    }

    @Transactional
    public void stopStream(Long videoDeviceId) {
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getVideoDeviceId, videoDeviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE);
        List<StreamSession> sessions = streamSessionMapper.selectList(wrapper);

        for (StreamSession session : sessions) {
            try {
                zlmApiClient.closeStream("live", session.getStreamId(), null);
            } catch (Exception e) {
                log.warn("ZLM close_stream error for streamId={}: {}", session.getStreamId(), e.getMessage());
            }
            session.setStatus(StreamStatus.CLOSED);
            session.setStoppedAt(LocalDateTime.now());
            streamSessionMapper.updateById(session);
        }

        log.info("Stream stopped: deviceId={}, closedCount={}", videoDeviceId, sessions.size());
    }

    public void ptzControl(Long videoDeviceId, PtzControlDTO dto) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStatus() != VideoDeviceStatus.ONLINE) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }

        if (device.getStreamMode() == StreamMode.GB28181 && device.getGbDeviceId() != null) {
            // GB28181 PTZ: 通过 SIP MESSAGE 发送 PTZ 二进制指令
            int speed = dto.getSpeed() != null ? dto.getSpeed() : 128;
            sipCommandSender.sendPtzControl(device, dto.getChannelId(), dto.getCommand(), speed);
        } else {
            log.info("PTZ control: deviceId={}, command={}, speed={} (non-GB28181, requires ONVIF)",
                    videoDeviceId, dto.getCommand(), dto.getSpeed());
        }
    }

    public String snapshot(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStatus() != VideoDeviceStatus.ONLINE) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }

        // 查找该设备的活跃流会话
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getVideoDeviceId, videoDeviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt)
                .last("LIMIT 1");
        StreamSession session = streamSessionMapper.selectOne(wrapper);

        String imageUrl;
        if (session != null) {
            // 通过 ZLM getSnap API 截图（使用 RTSP 内部地址）
            String rtspUrl = zlmApiClient.buildRtspUrl("live", session.getStreamId());
            byte[] snapData = zlmApiClient.getSnap(rtspUrl, 10, 3);
            if (snapData != null && snapData.length > 0) {
                String objectName = AppContextHolder.getTenantId() + "/video/" + videoDeviceId
                        + "/snapshot_" + System.currentTimeMillis() + ".jpg";
                imageUrl = fileClient.uploadBytes(objectName, "image/jpeg", snapData).getData().get("url");
                log.info("Snapshot taken via ZLM and uploaded to MinIO: deviceId={}, size={} bytes, url={}",
                        videoDeviceId, snapData.length, imageUrl);
            } else {
                imageUrl = "snapshot_failed";
                log.warn("Snapshot failed via ZLM for deviceId={}", videoDeviceId);
            }
        } else {
            imageUrl = "no_active_stream";
            log.warn("No active stream for snapshot: deviceId={}", videoDeviceId);
        }
        return imageUrl;
    }

    // ==================== Recording Control ====================

    public RecordingVO startRecording(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        if (device.getStatus() != VideoDeviceStatus.ONLINE) {
            throw new BizException(ResultCode.VIDEO_DEVICE_OFFLINE);
        }

        // Find active stream session for this device
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getVideoDeviceId, videoDeviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt)
                .last("LIMIT 1");
        StreamSession session = streamSessionMapper.selectOne(wrapper);
        if (session == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "无活跃的视频流，请先开始播放");
        }

        try {
            // type=1 表示 MP4 录制
            ZlmResponse<Map<String, Object>> resp = zlmApiClient.startRecord("live", session.getStreamId(), 1);
            if (!resp.isSuccess()) {
                log.error("ZLM startRecord failed: {}", resp.getMsg());
                throw new BizException(ResultCode.PARAM_ERROR, "开始录像失败: " + resp.getMsg());
            }
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.error("ZLM startRecord error: {}", e.getMessage());
            throw new BizException(ResultCode.PARAM_ERROR, "开始录像失败");
        }

        RecordingVO vo = new RecordingVO();
        vo.setVideoDeviceId(videoDeviceId);
        vo.setStreamId(session.getStreamId());
        vo.setRecording(true);
        vo.setStartedAt(LocalDateTime.now());
        log.info("Recording started: deviceId={}, streamId={}", videoDeviceId, session.getStreamId());
        return vo;
    }

    public RecordingVO stopRecording(Long videoDeviceId) {
        VideoDevice device = videoDeviceMapper.selectById(videoDeviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }

        // Find active stream session for this device
        LambdaQueryWrapper<StreamSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StreamSession::getVideoDeviceId, videoDeviceId)
                .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                .orderByDesc(StreamSession::getStartedAt)
                .last("LIMIT 1");
        StreamSession session = streamSessionMapper.selectOne(wrapper);
        if (session == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "无活跃的视频流");
        }

        try {
            ZlmResponse<Map<String, Object>> resp = zlmApiClient.stopRecord("live", session.getStreamId(), 1);
            if (!resp.isSuccess()) {
                log.warn("ZLM stopRecord response: {}", resp.getMsg());
            }
        } catch (Exception e) {
            log.warn("ZLM stopRecord error for streamId={}: {}", session.getStreamId(), e.getMessage());
        }

        RecordingVO vo = new RecordingVO();
        vo.setVideoDeviceId(videoDeviceId);
        vo.setStreamId(session.getStreamId());
        vo.setRecording(false);
        vo.setStoppedAt(LocalDateTime.now());
        log.info("Recording stopped: deviceId={}, streamId={}", videoDeviceId, session.getStreamId());
        return vo;
    }

    private void normalizeDevice(VideoDevice device, Boolean sipAuthEnabled) {
        device.setName(trimToNull(device.getName()));
        device.setGbDeviceId(trimToNull(device.getGbDeviceId()));
        device.setGbDomain(trimToNull(device.getGbDomain()));
        device.setTransport(trimToNull(device.getTransport()));
        device.setSipPassword(trimToNull(device.getSipPassword()));
        device.setIp(trimToNull(device.getIp()));
        device.setManufacturer(trimToNull(device.getManufacturer()));
        device.setModel(trimToNull(device.getModel()));
        device.setFirmware(trimToNull(device.getFirmware()));

        if (device.getStreamMode() == StreamMode.GB28181) {
            if (device.getTransport() == null) {
                device.setTransport("UDP");
            }
            boolean authEnabled = Boolean.TRUE.equals(sipAuthEnabled)
                    || (sipAuthEnabled == null && device.getSipPassword() != null);
            if (authEnabled) {
                if (device.getGbDeviceId() == null) {
                    throw new BizException(ResultCode.PARAM_ERROR, "启用 SIP 密码鉴权时必须填写 GB 设备编号");
                }
                if (device.getSipPassword() == null) {
                    throw new BizException(ResultCode.PARAM_ERROR, "启用 SIP 密码鉴权时必须填写 SIP 密码");
                }
            } else {
                device.setSipPassword(null);
            }
            return;
        }

        device.setSipPassword(null);
    }

    private Long resolveLinkedDeviceId(VideoDeviceCreateDTO dto, VideoDevice device) {
        if (device.getDeviceId() != null) {
            return device.getDeviceId();
        }

        String productKey = trimToNull(dto.getProductKey());
        if (productKey == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "请选择产品");
        }

        ProductBasicVO product = loadProductBasic(productKey);
        validateProductProtocol(product, device.getStreamMode());
        DataScopeContext dataScope = resolveCurrentDataScope();

        InternalDeviceCreateDTO createDTO = new InternalDeviceCreateDTO();
        createDTO.setProductId(product.getId());
        // 自动建设备资产时沿用当前产品链路与当前用户可见范围，避免 group/project 数据权限下
        // 视频设备刚保存就因为关联资产未落入当前范围而被列表过滤掉。
        createDTO.setProjectId(resolveLinkedProjectId(product, dataScope));
        createDTO.setGroupIds(resolveLinkedGroupIds(dataScope));
        createDTO.setDeviceName(generateLinkedDeviceName(productKey, device.getStreamMode()));
        createDTO.setNickname(device.getName());
        createDTO.setDescription(buildLinkedDeviceDescription(device));

        R<DeviceBasicVO> response = deviceClient.createDevice(createDTO);
        if (response == null || response.getCode() != 0 || response.getData() == null || response.getData().getId() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, response == null ? "创建设备资产失败" : response.getMessage());
        }
        return response.getData().getId();
    }

    private ProductBasicVO loadProductBasic(String productKey) {
        R<ProductBasicVO> response = productClient.getProductBasicByProductKey(productKey);
        if (response == null || response.getCode() != 0 || response.getData() == null || response.getData().getId() == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return response.getData();
    }

    private DataScopeContext resolveCurrentDataScope() {
        Long userId = AppContextHolder.getUserId();
        if (userId == null) {
            return null;
        }
        DataScopeResolver resolver = dataScopeResolverProvider.getIfAvailable();
        if (resolver == null) {
            return null;
        }
        return resolver.resolve(userId, AppContextHolder.getTenantId());
    }

    private Long resolveLinkedProjectId(ProductBasicVO product, DataScopeContext dataScope) {
        if (product.getProjectId() != null) {
            return product.getProjectId();
        }
        if (dataScope == null || dataScope.getProjectIds() == null || dataScope.getProjectIds().size() != 1) {
            return null;
        }
        return dataScope.getProjectIds().get(0);
    }

    private List<Long> resolveLinkedGroupIds(DataScopeContext dataScope) {
        if (dataScope == null || dataScope.getGroupIds() == null || dataScope.getGroupIds().isEmpty()) {
            return List.of();
        }
        return dataScope.getGroupIds().stream()
                .map(this::parseScopeGroupId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private Long parseScopeGroupId(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ignore) {
            return null;
        }
    }

    private void validateProductProtocol(ProductBasicVO product, StreamMode streamMode) {
        if (product.getProtocol() == null || streamMode == null) {
            return;
        }
        if (!streamMode.name().equalsIgnoreCase(product.getProtocol())) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频设备接入方式必须与产品协议一致");
        }
    }

    private String generateLinkedDeviceName(String productKey, StreamMode streamMode) {
        String prefix = normalizeLinkedDeviceNamePart(productKey);
        String protocol = streamMode == null ? "video" : streamMode.name().toLowerCase(Locale.ROOT);
        String timestamp = LocalDateTime.now().format(LINKED_DEVICE_NAME_TIME_FORMATTER);
        String random = String.format("%04d", ThreadLocalRandom.current().nextInt(10000));
        String candidate = prefix + "." + protocol + "." + timestamp + "." + random;
        return candidate.length() <= 64 ? candidate : candidate.substring(0, 64);
    }

    private String normalizeLinkedDeviceNamePart(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "video";
        }
        normalized = normalized.replaceAll("[^A-Za-z0-9:_.-]+", "-");
        normalized = normalized.replaceAll("-{2,}", "-");
        normalized = normalized.replaceAll("^[^A-Za-z0-9]+", "");
        normalized = normalized.replaceAll("[^A-Za-z0-9]+$", "");
        if (normalized.isEmpty()) {
            return "video";
        }
        if (normalized.length() > 24) {
            return normalized.substring(0, 24);
        }
        return normalized;
    }

    private String buildLinkedDeviceDescription(VideoDevice device) {
        String name = trimToNull(device.getName());
        if (name == null) {
            return "视频设备接入自动创建";
        }
        return "视频设备接入自动创建: " + name;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
