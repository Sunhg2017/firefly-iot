package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventQueryDTO;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventVO;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventWriteDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryAggregateDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryAggregateVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryDataVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryLatestVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryQueryDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryWriteDTO;
import com.songhg.firefly.iot.device.service.DeviceDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "设备数据", description = "设备遥测与事件数据查询")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class DeviceDataController {

    private final DeviceDataService deviceDataService;

    // ==================== Telemetry Write ====================

    @Operation(summary = "写入遥测数据")
    @PostMapping("/devices/{id}/telemetry")
    @RequiresPermission("data:write")
    public R<Void> writeTelemetry(
            @Parameter(description = "设备编号", required = true) @PathVariable Long id,
            @Valid @RequestBody TelemetryWriteDTO dto) {
        deviceDataService.writeTelemetry(id, dto);
        return R.ok();
    }

    @Operation(summary = "写入事件数据")
    @PostMapping("/devices/{id}/events")
    @RequiresPermission("data:write")
    public R<Void> writeEvent(
            @Parameter(description = "设备编号", required = true) @PathVariable Long id,
            @Valid @RequestBody DeviceEventWriteDTO dto) {
        deviceDataService.writeEvent(id, dto);
        return R.ok();
    }

    // ==================== Telemetry Query ====================

    @PostMapping("/device-data/query")
    @RequiresPermission("data:read")
    @Operation(summary = "查询遥测数据")
    public R<List<TelemetryDataVO>> queryTelemetry(@Valid @RequestBody TelemetryQueryDTO query) {
        return R.ok(deviceDataService.queryTelemetry(query));
    }

    @Operation(summary = "聚合查询遥测数据")
    @PostMapping("/device-data/aggregate")
    @RequiresPermission("data:read")
    public R<List<TelemetryAggregateVO>> aggregateTelemetry(@Valid @RequestBody TelemetryAggregateDTO query) {
        return R.ok(deviceDataService.aggregateTelemetry(query));
    }

    @Operation(summary = "查询最新遥测数据")
    @GetMapping("/device-data/latest/{deviceId}")
    @RequiresPermission("data:read")
    public R<List<TelemetryLatestVO>> queryLatest(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(deviceDataService.queryLatest(deviceId));
    }

    // ==================== Device Events ====================

    @PostMapping("/device-events/list")
    @RequiresPermission("data:read")
    @Operation(summary = "查询事件数据")
    public R<IPage<DeviceEventVO>> listEvents(@RequestBody DeviceEventQueryDTO query) {
        return R.ok(deviceDataService.listEvents(query));
    }
}
