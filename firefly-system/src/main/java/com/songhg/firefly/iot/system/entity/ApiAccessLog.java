package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("api_access_logs")
public class ApiAccessLog {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long apiKeyId;
    private Long tenantId;
    private String method;
    private String path;
    private Integer statusCode;
    private Integer latencyMs;
    private String clientIp;
    private Integer requestSize;
    private Integer responseSize;
    private String errorMessage;
    private LocalDateTime createdAt;
}
