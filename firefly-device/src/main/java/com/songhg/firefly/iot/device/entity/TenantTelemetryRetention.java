package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 按租户配置的时序数据保留策略。
 */
@Data
@TableName("tenant_telemetry_retention")
public class TenantTelemetryRetention {

    @TableId(type = IdType.INPUT)
    private Long tenantId;
    private Integer retentionDays;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
