package com.songhg.firefly.iot.data.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.data.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "Dashboard", description = "系统总览数据")
@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/overview")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "获取总览数据")
    public R<Map<String, Object>> getOverview() {
        return R.ok(dashboardService.getOverviewStats());
    }

    @GetMapping("/device-online-trend")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "获取设备在线趋势")
    public R<List<Map<String, Object>>> getDeviceOnlineTrend(@Parameter(description = "时间间隔") @RequestParam(defaultValue = "1h") String interval) {
        return R.ok(dashboardService.getDeviceOnlineTrend(interval));
    }

    @GetMapping("/alarm-distribution")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "获取告警等级分布")
    public R<List<Map<String, Object>>> getAlarmDistribution() {
        return R.ok(dashboardService.getAlarmLevelDistribution());
    }

    @GetMapping("/recent-alarms")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "获取近期告警")
    public R<List<Map<String, Object>>> getRecentAlarms(@Parameter(description = "告警数量上限") @RequestParam(defaultValue = "10") int limit) {
        return R.ok(dashboardService.getRecentAlarms(limit));
    }

    @GetMapping("/device-by-product")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "按产品统计设备数量")
    public R<List<Map<String, Object>>> getDeviceByProduct() {
        return R.ok(dashboardService.getDeviceByProduct());
    }
}
