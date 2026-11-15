package com.songhg.firefly.iot.media.dto.video;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 录像检索结果项：仅暴露录像文件业务标识与元数据，不暴露数据库主键与 ZLM 磁盘绝对路径。
 */
@Data
@Schema(description = "录像检索视图对象")
public class VideoRecordingVO {

    @Schema(description = "录像文件名（业务唯一键之一，用于回放/下载定位）")
    private String fileName;

    @Schema(description = "录像文件大小（字节）")
    private Long fileSize;

    @Schema(description = "录像开始时间（epoch 毫秒）")
    private Long startTime;

    @Schema(description = "录像时长（秒）")
    private Double durationSeconds;

    @Schema(description = "通道编号")
    private String channelId;
}
