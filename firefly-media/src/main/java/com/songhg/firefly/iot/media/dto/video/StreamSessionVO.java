package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.enums.StreamStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Stream session view object.
 */
@Data
@Schema(description = "推流会话视图对象")
public class StreamSessionVO {

    @Schema(description = "会话编号")
    private Long id;

    @Schema(description = "设备资产编号")
    private Long deviceId;

    @Schema(description = "通道编号")
    private String channelId;

    @Schema(description = "流编号")
    private String streamId;

    @Schema(description = "流状态")
    private StreamStatus status;

    @Schema(description = "播放地址")
    private String flvUrl;

    @Schema(description = "播放地址")
    private String hlsUrl;

    @Schema(description = "播放地址")
    private String webrtcUrl;

    @Schema(description = "开始时间")
    private LocalDateTime startedAt;

    @Schema(description = "结束时间")
    private LocalDateTime stoppedAt;
}
