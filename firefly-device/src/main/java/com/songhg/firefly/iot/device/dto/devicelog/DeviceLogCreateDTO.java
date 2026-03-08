package com.songhg.firefly.iot.device.dto.devicelog;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device log creation request.
 */
@Data
@Schema(description = "设备日志创建请求")
public class DeviceLogCreateDTO {

    @Schema(description = "设备编号")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "日志级别", example = "INFO")
    @Size(max = 20)
    private String level;

    @Schema(description = "模块名称", example = "connectivity")
    @Size(max = 64)
    private String module;

    @Schema(description = "日志内容")
    private String content;

    @Schema(description = "追踪编号")
    private String traceId;

    @Schema(description = "设备网络地址", example = "192.168.1.100")
    private String ip;

    @Schema(description = "设备上报时间")
    private LocalDateTime reportedAt;
}
