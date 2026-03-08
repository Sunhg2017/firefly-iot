package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.OtaDeviceStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("ota_task_devices")
public class OtaTaskDevice {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long taskId;
    private Long deviceId;
    private OtaDeviceStatus status;
    private Integer progress;
    private String errorMessage;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
