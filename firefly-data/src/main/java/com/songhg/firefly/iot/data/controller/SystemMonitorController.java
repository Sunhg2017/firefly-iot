package com.songhg.firefly.iot.data.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.data.service.SystemMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Tag(name = "系统监控", description = "系统运行状态监控")
@RestController
@RequestMapping("/api/v1/monitor")
@RequiredArgsConstructor
public class SystemMonitorController {

    private final SystemMonitorService monitorService;

    @GetMapping
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取系统信息")
    public R<Map<String, Object>> getSystemInfo() {
        return R.ok(monitorService.getSystemInfo());
    }

    @GetMapping("/jvm")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取 JVM 信息")
    public R<Map<String, Object>> getJvmInfo() {
        return R.ok(monitorService.getJvmInfo());
    }

    @GetMapping("/memory")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取内存信息")
    public R<Map<String, Object>> getMemoryInfo() {
        return R.ok(monitorService.getMemoryInfo());
    }

    @GetMapping("/cpu")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取 CPU 信息")
    public R<Map<String, Object>> getCpuInfo() {
        return R.ok(monitorService.getCpuInfo());
    }

    @GetMapping("/disk")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取磁盘信息")
    public R<List<Map<String, Object>>> getDiskInfo() {
        return R.ok(monitorService.getDiskInfo());
    }

    @GetMapping("/thread")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取线程信息")
    public R<Map<String, Object>> getThreadInfo() {
        return R.ok(monitorService.getThreadInfo());
    }

    @GetMapping("/gc")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取 GC 信息")
    public R<List<Map<String, Object>>> getGcInfo() {
        return R.ok(monitorService.getGcInfo());
    }

    @GetMapping("/server")
    @RequiresPermission("monitor:read")
    @Operation(summary = "获取服务器信息")
    public R<Map<String, Object>> getServerInfo() {
        return R.ok(monitorService.getServerInfo());
    }
}
