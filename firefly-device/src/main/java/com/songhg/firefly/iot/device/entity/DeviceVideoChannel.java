package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device_video_channels")
public class DeviceVideoChannel {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private String channelId;
    private String name;
    private String manufacturer;
    private String model;
    private VideoDeviceStatus status;
    private Integer ptzType;
    private Integer subCount;
    private Double longitude;
    private Double latitude;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
