package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("api_call_stats_daily")
public class ApiCallStatsDaily {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long apiKeyId;
    private Long tenantId;
    private LocalDate statDate;
    private Long totalCalls;
    private Long successCalls;
    private Long errorCalls;
    private Integer avgLatencyMs;
    private Integer maxLatencyMs;
    private Integer p99LatencyMs;
    private LocalDateTime createdAt;
}
