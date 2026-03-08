package com.songhg.firefly.iot.system.dto.audit;

import com.songhg.firefly.iot.common.enums.AuditAction;
import com.songhg.firefly.iot.common.enums.AuditModule;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Audit log view object.
 */
@Data
@Schema(description = "审计日志视图对象")
public class AuditLogVO {

    @Schema(description = "日志编号")
    private Long id;

    @Schema(description = "租户编号")
    private Long tenantId;

    @Schema(description = "用户编号")
    private Long userId;

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "审计模块")
    private AuditModule module;

    @Schema(description = "审计动作")
    private AuditAction action;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "目标实体类型")
    private String targetType;

    @Schema(description = "目标实体编号")
    private String targetId;

    @Schema(description = "请求方法")
    private String requestMethod;

    @Schema(description = "请求地址")
    private String requestUrl;

    @Schema(description = "响应状态")
    private String responseStatus;

    @Schema(description = "客户端网络地址")
    private String clientIp;

    @Schema(description = "耗时毫秒数")
    private Long duration;

    @Schema(description = "错误信息")
    private String errorMessage;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
