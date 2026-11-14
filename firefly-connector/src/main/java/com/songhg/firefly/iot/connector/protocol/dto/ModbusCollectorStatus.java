package com.songhg.firefly.iot.connector.protocol.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Modbus 采集任务运行状态。用于控制台展示“是否运行 / 最近一次成功采集时间 / 最近错误”，
 * 避免用户只能看到布尔值而无法判断任务是否真的在采集数据。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Modbus 采集任务运行状态")
public class ModbusCollectorStatus {

    @Schema(description = "任务是否已注册并在调度")
    private boolean running;

    @Schema(description = "最近一次成功采集时间")
    private LocalDateTime lastCollectAt;

    @Schema(description = "最近一次采集尝试时间")
    private LocalDateTime lastAttemptAt;

    @Schema(description = "最近一次采集错误")
    private String lastError;

    @Schema(description = "连续失败次数")
    private int consecutiveFailures;
}
