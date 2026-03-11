package com.songhg.firefly.iot.support.dto.asynctask;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 异步任务视图对象
 */
@Data
@Schema(description = "异步任务视图对象")
public class AsyncTaskVO {

    @Schema(description = "任务ID")
    private Long id;

    @Schema(description = "任务名称")
    private String taskName;

    @Schema(description = "任务类型")
    private String taskType;

    @Schema(description = "业务类型")
    private String bizType;

    @Schema(description = "文件格式")
    private String fileFormat;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "进度 (0-100)")
    private Integer progress;

    @Schema(description = "附加业务数据（JSON 字符串）")
    private String extraData;

    @Schema(description = "结果文件路径")
    private String resultUrl;

    @Schema(description = "结果文件大小（字节）")
    private Long resultSize;

    @Schema(description = "总行数")
    private Integer totalRows;

    @Schema(description = "错误信息")
    private String errorMessage;

    @Schema(description = "创建者用户ID")
    private Long createdBy;

    @Schema(description = "完成时间")
    private LocalDateTime completedAt;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "更新时间")
    private LocalDateTime updatedAt;
}
