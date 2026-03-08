package com.songhg.firefly.iot.data.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.data.dto.analysis.AggregationQueryDTO;
import com.songhg.firefly.iot.data.dto.analysis.DataExportDTO;
import com.songhg.firefly.iot.data.dto.analysis.TimeSeriesQueryDTO;
import com.songhg.firefly.iot.data.service.DataAnalysisService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "数据分析", description = "设备数据分析与报表")
@RestController
@RequestMapping("/api/v1/analysis")
@RequiredArgsConstructor
public class DataAnalysisController {

    private final DataAnalysisService dataAnalysisService;

    @Operation(summary = "查询时序数据")
    @PostMapping("/timeseries")
    @RequiresPermission("analysis:read")
    public R<Map<String, Object>> queryTimeSeries(@Valid @RequestBody TimeSeriesQueryDTO query) {
        return R.ok(dataAnalysisService.queryTimeSeries(query));
    }

    @Operation(summary = "查询聚合数据")
    @PostMapping("/aggregation")
    @RequiresPermission("analysis:read")
    public R<List<Map<String, Object>>> queryAggregation(@Valid @RequestBody AggregationQueryDTO query) {
        return R.ok(dataAnalysisService.queryAggregation(query));
    }

    @Operation(summary = "获取设备统计")
    @GetMapping("/stats")
    @RequiresPermission("analysis:read")
    public R<Map<String, Object>> getDeviceStats(
            @Parameter(description = "设备编号") @RequestParam Long deviceId,
            @Parameter(description = "属性名称") @RequestParam String property,
            @Parameter(description = "开始时间") @RequestParam(required = false) String startTime,
            @Parameter(description = "结束时间") @RequestParam(required = false) String endTime) {
        return R.ok(dataAnalysisService.getDeviceStats(deviceId, property, startTime, endTime));
    }

    @PostMapping("/export")
    @RequiresPermission("analysis:export")
    @Operation(summary = "导出分析数据")
    public ResponseEntity<byte[]> exportData(@Valid @RequestBody DataExportDTO dto) {
        byte[] data = dataAnalysisService.exportData(dto);
        String filename = "device_data_export.csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }
}
