package com.songhg.firefly.iot.media.service;

import com.songhg.firefly.iot.api.client.DeviceVideoClient;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class VideoDeviceFacade {

    private final DeviceVideoClient deviceVideoClient;

    public InternalVideoDeviceVO requireVideoDevice(Long deviceId) {
        InternalVideoDeviceVO device = getVideoDevice(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        return device;
    }

    public InternalVideoDeviceVO getVideoDevice(Long deviceId) {
        return unwrapNullable(deviceVideoClient.getVideoDevice(deviceId), "查询视频设备失败");
    }

    public InternalVideoDeviceVO getByGbIdentity(String gbDeviceId, String gbDomain) {
        return unwrapNullable(deviceVideoClient.getByGbIdentity(gbDeviceId, gbDomain), "按 GB 身份查询视频设备失败");
    }

    public StreamMode requireStreamMode(InternalVideoDeviceVO device) {
        StreamMode streamMode = resolveStreamMode(device);
        if (streamMode == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频设备接入方式不能为空");
        }
        return streamMode;
    }

    public StreamMode resolveStreamMode(InternalVideoDeviceVO device) {
        String streamMode = trimToNull(device == null ? null : device.getStreamMode());
        if (streamMode == null) {
            return null;
        }
        try {
            return StreamMode.valueOf(streamMode.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "未知的视频接入方式: " + streamMode);
        }
    }

    public VideoDeviceStatus resolveStatus(InternalVideoDeviceVO device) {
        String status = trimToNull(device == null ? null : device.getStatus());
        if (status == null) {
            return null;
        }
        try {
            return VideoDeviceStatus.valueOf(status.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    public boolean isOnline(InternalVideoDeviceVO device) {
        return resolveStatus(device) == VideoDeviceStatus.ONLINE;
    }

    private <T> T unwrapNullable(R<T> response, String fallbackMessage) {
        if (response == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, fallbackMessage);
        }
        if (response.getCode() != 0) {
            String message = trimToNull(response.getMessage());
            throw new BizException(response.getCode(), message == null ? fallbackMessage : message);
        }
        return response.getData();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
