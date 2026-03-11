package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.convert.DeviceLogConvert;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogCreateDTO;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogQueryParam;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogVO;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import com.songhg.firefly.iot.device.service.DeviceLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "设备日志", description = "设备日志查询与统计")
@RestController
@RequestMapping("/api/v1/device-logs")
@RequiredArgsConstructor
public class DeviceLogController {

    private final DeviceLogService deviceLogService;

    @PostMapping
    @Operation(summary = "记录设备日志")
    public R<DeviceLogVO> record(@Valid @RequestBody DeviceLogCreateDTO dto) {
        DeviceLog deviceLog = new DeviceLog();
        deviceLog.setTenantId(AppContextHolder.getTenantId());
        deviceLog.setDeviceId(dto.getDeviceId());
        deviceLog.setProductId(dto.getProductId());
        deviceLog.setLevel(dto.getLevel());
        deviceLog.setModule(dto.getModule());
        deviceLog.setContent(dto.getContent());
        deviceLog.setTraceId(dto.getTraceId());
        deviceLog.setIp(dto.getIp());
        return R.ok(DeviceLogConvert.INSTANCE.toVO(deviceLogService.record(deviceLog)));
    }

    @PostMapping("/list")
    @RequiresPermission("device-log:read")
    @Operation(summary = "分页查询设备日志")
    public R<IPage<DeviceLogVO>> listLogs(
            @RequestBody DeviceLogQueryParam query) {
        return R.ok(deviceLogService.listLogs(query)
                .convert(DeviceLogConvert.INSTANCE::toVO));
    }

    @GetMapping("/{deviceId}/recent")
    @RequiresPermission("device-log:read")
    @Operation(summary = "获取最近设备日志")
    public R<List<DeviceLogVO>> getRecentLogs(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "最大记录数") @RequestParam(defaultValue = "100") int limit) {
        return R.ok(deviceLogService.getRecentLogs(deviceId, limit).stream().map(DeviceLogConvert.INSTANCE::toVO).toList());
    }

    @Operation(summary = "按级别统计设备日志")
    @GetMapping("/{deviceId}/count")
    @RequiresPermission("device-log:read")
    public R<Map<String, Long>> countByLevel(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(Map.of(
                "DEBUG", deviceLogService.countByLevel(deviceId, "DEBUG"),
                "INFO", deviceLogService.countByLevel(deviceId, "INFO"),
                "WARN", deviceLogService.countByLevel(deviceId, "WARN"),
                "ERROR", deviceLogService.countByLevel(deviceId, "ERROR")
        ));
    }

    @PostMapping("/clean")
    @RequiresPermission("device-log:delete")
    @Operation(summary = "清理过期设备日志")
    public R<Integer> cleanExpired(
            @Parameter(description = "保留天数") @RequestParam(defaultValue = "30") int days) {
        return R.ok(deviceLogService.cleanExpiredLogs(days));
    }
}
