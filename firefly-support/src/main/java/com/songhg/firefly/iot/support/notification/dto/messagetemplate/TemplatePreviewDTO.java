package com.songhg.firefly.iot.support.notification.dto.messagetemplate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

/**
 * Template preview request.
 */
@Data
@Schema(description = "模板预览请求")
public class TemplatePreviewDTO {

    @Schema(description = "模板内容")
    @NotBlank(message = "模板内容不能为空")
    private String content;

    @Schema(description = "变量键值对")
    private Map<String, String> variables;
}
