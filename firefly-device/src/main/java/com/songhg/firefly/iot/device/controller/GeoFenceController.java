package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.convert.GeoFenceConvert;
import com.songhg.firefly.iot.device.dto.geo.DeviceLocationVO;
import com.songhg.firefly.iot.device.dto.geo.DeviceLocationHistoryQueryDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceCreateDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceQueryDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceUpdateDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceVO;
import com.songhg.firefly.iot.device.dto.geo.LocationReportDTO;
import com.songhg.firefly.iot.device.entity.DeviceLocation;
import com.songhg.firefly.iot.device.entity.GeoFence;
import com.songhg.firefly.iot.device.service.DeviceLocationService;
import com.songhg.firefly.iot.device.service.GeoFenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Tag(name = "地理围栏", description = "围栏 CRUD、设备位置、围栏判定")
@RestController
@RequestMapping("/api/v1/geo")
@RequiredArgsConstructor
public class GeoFenceController {

    private final GeoFenceService fenceService;
    private final DeviceLocationService locationService;

    // ==================== GeoFence ====================

    @PostMapping("/fences")
    @RequiresPermission("geo-fence:create")
    @Operation(summary = "创建地理围栏")
    public R<GeoFenceVO> createFence(@Valid @RequestBody GeoFenceCreateDTO dto) {
        GeoFence fence = GeoFenceConvert.INSTANCE.toEntity(dto);
        return R.ok(GeoFenceConvert.INSTANCE.toVO(fenceService.createFence(fence)));
    }

    @PostMapping("/fences/list")
    @RequiresPermission("geo-fence:read")
    @Operation(summary = "查询围栏列表")
    public R<IPage<GeoFenceVO>> listFences(@RequestBody GeoFenceQueryDTO query) {
        return R.ok(fenceService.listFences(query).convert(GeoFenceConvert.INSTANCE::toVO));
    }

    @GetMapping("/fences/{id}")
    @RequiresPermission("geo-fence:read")
    @Operation(summary = "获取围栏详情")
    public R<GeoFenceVO> getFence(
            @Parameter(description = "围栏编号", required = true) @PathVariable Long id) {
        return R.ok(GeoFenceConvert.INSTANCE.toVO(fenceService.getFence(id)));
    }

    @PutMapping("/fences/{id}")
    @RequiresPermission("geo-fence:update")
    @Operation(summary = "更新围栏")
    public R<GeoFenceVO> updateFence(
            @Parameter(description = "围栏编号", required = true) @PathVariable Long id,
            @Valid @RequestBody GeoFenceUpdateDTO dto) {
        GeoFence fence = fenceService.getFence(id);
        GeoFenceConvert.INSTANCE.updateEntity(dto, fence);
        return R.ok(GeoFenceConvert.INSTANCE.toVO(fenceService.updateFence(id, fence)));
    }

    @DeleteMapping("/fences/{id}")
    @RequiresPermission("geo-fence:delete")
    @Operation(summary = "删除围栏")
    public R<Void> deleteFence(
            @Parameter(description = "围栏编号", required = true) @PathVariable Long id) {
        fenceService.deleteFence(id);
        return R.ok();
    }

    @Operation(summary = "启用/禁用围栏")
    @PutMapping("/fences/{id}/toggle")
    @RequiresPermission("geo-fence:update")
    public R<Void> toggleEnabled(
            @Parameter(description = "围栏编号", required = true) @PathVariable Long id,
            @Parameter(description = "是否启用", required = true) @RequestParam boolean enabled) {
        fenceService.toggleEnabled(id, enabled);
        return R.ok();
    }

    @Operation(summary = "围栏位置判定")
    @PostMapping("/fences/{id}/check")
    @RequiresPermission("geo-fence:read")
    public R<Map<String, Object>> checkPosition(
            @Parameter(description = "围栏编号", required = true) @PathVariable Long id,
            @Parameter(description = "经度", required = true) @RequestParam double lng,
            @Parameter(description = "纬度", required = true) @RequestParam double lat) {
        GeoFence fence = fenceService.getFence(id);
        boolean inside = fenceService.isInside(fence, lng, lat);
        return R.ok(Map.of("fenceId", id, "inside", inside, "lng", lng, "lat", lat));
    }

    // ==================== Device Location ====================

    @PostMapping("/locations/report")
    @Operation(summary = "上报设备位置")
    public R<DeviceLocationVO> reportLocation(@Valid @RequestBody LocationReportDTO dto) {
        DeviceLocation loc = new DeviceLocation();
        loc.setDeviceId(dto.getDeviceId());
        loc.setLng(dto.getLng());
        loc.setLat(dto.getLat());
        loc.setAltitude(dto.getAltitude());
        loc.setSpeed(dto.getSpeed());
        loc.setHeading(dto.getHeading());
        loc.setSource(dto.getSource());
        return R.ok(GeoFenceConvert.INSTANCE.toLocationVO(locationService.reportLocation(loc)));
    }

    @Operation(summary = "获取设备最新位置")
    @GetMapping("/locations/{deviceId}/latest")
    @RequiresPermission("device:read")
    public R<DeviceLocationVO> getLatestLocation(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(GeoFenceConvert.INSTANCE.toLocationVO(locationService.getLatestLocation(deviceId)));
    }

    @PostMapping("/locations/{deviceId}/history/list")
    @RequiresPermission("device:read")
    @Operation(summary = "查询位置历史")
    public R<IPage<DeviceLocationVO>> getLocationHistory(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @RequestBody DeviceLocationHistoryQueryDTO query) {
        return R.ok(locationService.getLocationHistory(deviceId, query)
                .convert(GeoFenceConvert.INSTANCE::toLocationVO));
    }

    @Operation(summary = "查询设备轨迹")
    @GetMapping("/locations/{deviceId}/track")
    @RequiresPermission("device:read")
    public R<List<DeviceLocationVO>> getTrack(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "开始时间") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @Parameter(description = "结束时间") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end,
            @Parameter(description = "最大轨迹点数") @RequestParam(defaultValue = "1000") int limit) {
        return R.ok(locationService.getTrack(deviceId, start, end, limit).stream()
                .map(GeoFenceConvert.INSTANCE::toLocationVO).toList());
    }
}
