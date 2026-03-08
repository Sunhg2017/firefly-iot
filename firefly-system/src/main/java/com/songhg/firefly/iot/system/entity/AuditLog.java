package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.AuditAction;
import com.songhg.firefly.iot.common.enums.AuditModule;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("audit_logs")
public class AuditLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long userId;
    private String username;
    private AuditModule module;
    private AuditAction action;
    private String description;
    private String targetType;
    private String targetId;
    private String requestMethod;
    private String requestUrl;
    private String requestParams;
    private String requestBody;
    private String responseStatus;
    private String clientIp;
    private String userAgent;
    private Long duration;
    private String errorMessage;
    private LocalDateTime createdAt;
}
