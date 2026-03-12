package com.songhg.firefly.iot.data.dto.analysis;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "属性候选查询请求")
public class PropertyOptionQueryDTO {

    @Schema(description = "设备ID列表")
    private List<Long> deviceIds;

    @Schema(description = "开始时间")
    private String startTime;

    @Schema(description = "结束时间")
    private String endTime;
}
