package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("tenant_usage_daily")
public class TenantUsageDaily implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private LocalDate date;
    private Integer deviceCount;
    private Integer deviceOnlinePeak;
    private Long messageCount;
    private Integer messageRatePeak;
    private Integer ruleCount;
    private Long apiCallCount;
    private Long storageBytes;
    private Integer videoChannelCount;
    private Long videoStorageBytes;
    private LocalDateTime createdAt;
}
