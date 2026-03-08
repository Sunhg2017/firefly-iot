package com.songhg.firefly.iot.support.notification.dto.messagetemplate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Message template creation request.
 */
@Data
@Schema(description = "消息模板创建请求")
public class MessageTemplateCreateDTO {

    @Schema(description = "模板编码", example = "ALARM_NOTIFY")
    @NotBlank(message = "模板编码不能为空")
    @Size(max = 64)
    private String code;

    @Schema(description = "模板名称")
    @NotBlank(message = "模板名称不能为空")
    @Size(max = 128)
    private String name;

    @Schema(description = "通道")
    @NotBlank(message = "通道不能为空")
    private String channel;

    @Schema(description = "模板类型")
    private String templateType;

    @Schema(description = "主题")
    private String subject;

    @Schema(description = "内容")
    private String content;

    @Schema(description = "变量")
    private String variables;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;
}
