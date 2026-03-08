package com.songhg.firefly.iot.system.dto.project;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Project creation request.
 */
@Data
@Schema(description = "Project creation request")
public class ProjectCreateDTO {

    @Schema(description = "Project code", example = "smart_home")
    @NotBlank(message = "项目代码不能为空")
    @Size(max = 64)
    @Pattern(regexp = "^[a-z][a-z0-9_]{2,63}$", message = "项目代码格式: 小写字母开头, 3-64位字母数字下划线")
    private String code;

    @Schema(description = "Project name", example = "Smart Home")
    @NotBlank(message = "项目名称不能为空")
    @Size(max = 256)
    private String name;

    @Schema(description = "Description")
    private String description;
}
