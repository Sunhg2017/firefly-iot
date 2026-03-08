package com.songhg.firefly.iot.media.dto.video;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Recording view object.
 */
@Data
@Schema(description = "录像视图对象")
public class RecordingVO {

    @Schema(description = "视频设备编号")
    private Long videoDeviceId;

    @Schema(description = "流编号")
    private String streamId;

    @Schema(description = "是否录制")
    private Boolean recording;

    @Schema(description = "录制开始时间")
    private LocalDateTime startedAt;

    @Schema(description = "录制结束时间")
    private LocalDateTime stoppedAt;
}
