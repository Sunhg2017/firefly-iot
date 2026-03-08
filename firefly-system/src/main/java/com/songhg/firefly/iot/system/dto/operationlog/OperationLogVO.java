package com.songhg.firefly.iot.system.dto.operationlog;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Operation log view object.
 */
@Data
@Schema(description = "操作日志视图对象")
public class OperationLogVO {

    @Schema(description = "日志编号")
    private Long id;

    @Schema(description = "租户编号")
    private Long tenantId;

    @Schema(description = "用户编号")
    private Long userId;

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "模块")
    private String module;

    @Schema(description = "操作类型")
    private String operationType;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "方法")
    private String method;

    @Schema(description = "请求地址")
    private String requestUrl;

    @Schema(description = "请求方法")
    private String requestMethod;

    @Schema(description = "请求参数")
    private String requestParams;

    @Schema(description = "响应结果")
    private String responseResult;

    @Schema(description = "客户端网络地址")
    private String ip;

    @Schema(description = "客户端标识")
    private String userAgent;

    @Schema(description = "状态")
    private Integer status;

    @Schema(description = "错误信息")
    private String errorMsg;

    @Schema(description = "耗时毫秒数")
    private Long costMs;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
