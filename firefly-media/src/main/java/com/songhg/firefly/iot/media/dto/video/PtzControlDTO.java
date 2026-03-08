package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.enums.PtzCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * PTZ control request.
 */
@Data
@Schema(description = "云台控制请求")
public class PtzControlDTO {

    @Schema(description = "通道编号")
    private String channelId;

    @Schema(description = "云台指令")
    @NotNull(message = "PTZ指令不能为空")
    private PtzCommand command;

    @Schema(description = "速度")
    private Integer speed;
}
