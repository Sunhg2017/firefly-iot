package com.songhg.firefly.iot.media.convert;

import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.VideoChannelVO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceUpdateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceVO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.entity.VideoChannel;
import com.songhg.firefly.iot.media.entity.VideoDevice;

/**
 * 视频监控对象转换器。
 * 视频设备创建/更新链路使用显式字段映射，避免生成式转换实现把关键接入参数带丢后难以排查。
 */
public final class VideoConvert {

    private VideoConvert() {
    }

    public static VideoDeviceVO toDeviceVO(VideoDevice entity) {
        if (entity == null) {
            return null;
        }
        VideoDeviceVO vo = new VideoDeviceVO();
        vo.setId(entity.getId());
        vo.setTenantId(entity.getTenantId());
        vo.setDeviceId(entity.getDeviceId());
        vo.setName(entity.getName());
        vo.setGbDeviceId(entity.getGbDeviceId());
        vo.setGbDomain(entity.getGbDomain());
        vo.setTransport(entity.getTransport());
        vo.setSipAuthEnabled(entity.getSipAuthEnabled());
        vo.setStreamMode(entity.getStreamMode());
        vo.setIp(entity.getIp());
        vo.setPort(entity.getPort());
        vo.setManufacturer(entity.getManufacturer());
        vo.setModel(entity.getModel());
        vo.setFirmware(entity.getFirmware());
        vo.setStatus(entity.getStatus());
        vo.setLastRegisteredAt(entity.getLastRegisteredAt());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    public static VideoDevice toDeviceEntity(VideoDeviceCreateDTO dto) {
        if (dto == null) {
            return null;
        }
        VideoDevice entity = new VideoDevice();
        entity.setDeviceId(dto.getDeviceId());
        entity.setName(dto.getName());
        entity.setGbDeviceId(dto.getGbDeviceId());
        entity.setGbDomain(dto.getGbDomain());
        entity.setTransport(dto.getTransport());
        entity.setSipPassword(dto.getSipPassword());
        entity.setStreamMode(dto.getStreamMode());
        entity.setIp(dto.getIp());
        entity.setPort(dto.getPort());
        entity.setManufacturer(dto.getManufacturer());
        entity.setModel(dto.getModel());
        entity.setFirmware(dto.getFirmware());
        return entity;
    }

    public static void updateDeviceEntity(VideoDeviceUpdateDTO dto, VideoDevice entity) {
        if (dto == null || entity == null) {
            return;
        }
        if (dto.getName() != null) {
            entity.setName(dto.getName());
        }
        if (dto.getGbDeviceId() != null) {
            entity.setGbDeviceId(dto.getGbDeviceId());
        }
        if (dto.getGbDomain() != null) {
            entity.setGbDomain(dto.getGbDomain());
        }
        if (dto.getTransport() != null) {
            entity.setTransport(dto.getTransport());
        }
        if (dto.getSipPassword() != null) {
            entity.setSipPassword(dto.getSipPassword());
        }
        if (dto.getStreamMode() != null) {
            entity.setStreamMode(dto.getStreamMode());
        }
        if (dto.getIp() != null) {
            entity.setIp(dto.getIp());
        }
        if (dto.getPort() != null) {
            entity.setPort(dto.getPort());
        }
        if (dto.getManufacturer() != null) {
            entity.setManufacturer(dto.getManufacturer());
        }
        if (dto.getModel() != null) {
            entity.setModel(dto.getModel());
        }
        if (dto.getFirmware() != null) {
            entity.setFirmware(dto.getFirmware());
        }
    }

    public static VideoChannelVO toChannelVO(VideoChannel entity) {
        if (entity == null) {
            return null;
        }
        VideoChannelVO vo = new VideoChannelVO();
        vo.setId(entity.getId());
        vo.setVideoDeviceId(entity.getVideoDeviceId());
        vo.setChannelId(entity.getChannelId());
        vo.setName(entity.getName());
        vo.setManufacturer(entity.getManufacturer());
        vo.setModel(entity.getModel());
        vo.setStatus(entity.getStatus());
        vo.setPtzType(entity.getPtzType());
        vo.setSubCount(entity.getSubCount());
        vo.setLongitude(entity.getLongitude());
        vo.setLatitude(entity.getLatitude());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    public static StreamSessionVO toSessionVO(StreamSession entity) {
        if (entity == null) {
            return null;
        }
        StreamSessionVO vo = new StreamSessionVO();
        vo.setId(entity.getId());
        vo.setVideoDeviceId(entity.getVideoDeviceId());
        vo.setChannelId(entity.getChannelId());
        vo.setStreamId(entity.getStreamId());
        vo.setStatus(entity.getStatus());
        vo.setFlvUrl(entity.getFlvUrl());
        vo.setHlsUrl(entity.getHlsUrl());
        vo.setWebrtcUrl(entity.getWebrtcUrl());
        vo.setStartedAt(entity.getStartedAt());
        vo.setStoppedAt(entity.getStoppedAt());
        return vo;
    }
}
