package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device_video_profiles")
public class DeviceVideoProfile {

    @TableId
    private Long deviceId;
    private Long tenantId;
    private StreamMode streamMode;
    private String gbDeviceId;
    private String gbDomain;
    private String transport;
    private String sipPassword;
    private String ip;
    private Integer port;
    private String sourceUrl;
    private String manufacturer;
    private String model;
    private String firmware;
    private VideoDeviceStatus status;
    private LocalDateTime lastRegisteredAt;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
