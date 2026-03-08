package com.songhg.firefly.iot.support.notification.dto.messagetemplate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

/**
 * Template render request.
 */
@Data
@Schema(description = "模板渲染请求")
public class TemplateRenderDTO {

    @Schema(description = "模板编码")
    @NotBlank(message = "模板编码不能为空")
    private String code;

    @Schema(description = "变量键值对")
    private Map<String, String> variables;
}
