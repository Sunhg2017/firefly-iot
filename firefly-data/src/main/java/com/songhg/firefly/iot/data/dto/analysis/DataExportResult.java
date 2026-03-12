package com.songhg.firefly.iot.data.dto.analysis;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
@Schema(description = "数据导出查询结果")
public class DataExportResult {

    @Schema(description = "导出记录")
    private List<Map<String, Object>> records;

    @Schema(description = "是否因保护阈值被截断")
    private boolean truncated;
}
