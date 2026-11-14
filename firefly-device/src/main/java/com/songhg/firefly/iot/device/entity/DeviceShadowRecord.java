package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备影子 desired 权威副本。
 */
@Data
@TableName("device_shadow")
public class DeviceShadowRecord {

    @TableId(type = IdType.INPUT)
    private Long deviceId;

    private Long tenantId;

    /**
     * desired JSON 字符串（JSONB）。
     */
    private String desired;

    private Long version;

    private LocalDateTime updatedAt;
}
