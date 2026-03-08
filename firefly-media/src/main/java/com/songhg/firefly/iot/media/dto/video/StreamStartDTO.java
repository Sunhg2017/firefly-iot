package com.songhg.firefly.iot.media.dto.video;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Stream start request.
 */
@Data
@Schema(description = "推流开始请求")
public class StreamStartDTO {

    @Schema(description = "通道编号")
    private String channelId;
}
