package com.songhg.firefly.iot.data.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * API access log view object.
 */
@Data
@Schema(description = "接口访问日志视图对象")
public class ApiAccessLogVO {

    @Schema(description = "日志编号")
    private Long id;

    @Schema(description = "接口密钥编号")
    private Long apiKeyId;

    @Schema(description = "请求方法")
    private String method;

    @Schema(description = "请求路径")
    private String path;

    @Schema(description = "状态码")
    private Integer statusCode;

    @Schema(description = "时延毫秒数")
    private Integer latencyMs;

    @Schema(description = "客户端网络地址")
    private String clientIp;

    @Schema(description = "请求体大小字节数")
    private Integer requestSize;

    @Schema(description = "响应体大小字节数")
    private Integer responseSize;

    @Schema(description = "错误信息")
    private String errorMessage;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
