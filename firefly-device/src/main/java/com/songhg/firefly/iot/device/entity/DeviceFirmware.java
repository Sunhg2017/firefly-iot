package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("device_firmwares")
public class DeviceFirmware implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private Long firmwareId;
    private String currentVersion;
    private String targetVersion;
    private String upgradeStatus;
    private Integer upgradeProgress;
    private LocalDateTime lastUpgradeAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
