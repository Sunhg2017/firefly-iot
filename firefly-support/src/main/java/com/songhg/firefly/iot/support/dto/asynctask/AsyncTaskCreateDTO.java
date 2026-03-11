package com.songhg.firefly.iot.support.dto.asynctask;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Async task creation request.
 */
@Data
@Schema(description = "异步任务创建请求")
public class AsyncTaskCreateDTO {

    @Schema(description = "任务名称")
    @NotBlank(message = "任务名称不能为空")
    @Size(max = 200)
    private String taskName;

    @Schema(description = "任务类型")
    @NotBlank(message = "任务类型不能为空")
    private String taskType;

    @Schema(description = "业务类型")
    private String bizType;

    @Schema(description = "文件格式")
    private String fileFormat;

    @Schema(description = "附加业务数据（JSON 字符串）")
    private String extraData;
}
