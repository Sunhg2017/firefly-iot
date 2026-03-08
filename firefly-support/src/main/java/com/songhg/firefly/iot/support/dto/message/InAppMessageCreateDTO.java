package com.songhg.firefly.iot.support.dto.message;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * In-app message creation request.
 */
@Data
@Schema(description = "站内信创建请求")
public class InAppMessageCreateDTO {

    @Schema(description = "目标用户编号")
    @NotNull(message = "用户ID不能为空")
    private Long userId;

    @Schema(description = "标题")
    @NotBlank(message = "标题不能为空")
    private String title;

    @Schema(description = "内容")
    @NotBlank(message = "内容不能为空")
    private String content;

    @Schema(description = "消息类型", example = "SYSTEM")
    private String type = "SYSTEM";

    @Schema(description = "级别", example = "INFO")
    private String level = "INFO";

    @Schema(description = "来源")
    private String source;

    @Schema(description = "来源编号")
    private String sourceId;
}
