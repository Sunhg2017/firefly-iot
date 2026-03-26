package com.songhg.firefly.iot.media.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("video_devices")
public class VideoDevice {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private String name;
    private String gbDeviceId;
    private String gbDomain;
    private String transport;
    private String sipPassword;
    private StreamMode streamMode;
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

    public Boolean getSipAuthEnabled() {
        return sipPassword != null && !sipPassword.isBlank();
    }
}
