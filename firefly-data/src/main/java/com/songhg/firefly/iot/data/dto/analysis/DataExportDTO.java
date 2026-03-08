package com.songhg.firefly.iot.data.dto.analysis;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Data export request.
 */
@Data
@Schema(description = "数据导出请求")
public class DataExportDTO {

    @Schema(description = "设备编号列表")
    @NotNull(message = "设备ID不能为空")
    private List<Long> deviceIds;

    @Schema(description = "导出属性名称列表")
    private List<String> properties;

    @Schema(description = "开始时间")
    private String startTime;

    @Schema(description = "结束时间")
    private String endTime;

    @Schema(description = "导出格式", example = "CSV")
    private String format = "CSV";
}
