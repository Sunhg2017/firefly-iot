package com.songhg.firefly.iot.system.dto.dict;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Dictionary type creation request.
 */
@Data
@Schema(description = "Dictionary type creation request")
public class DictTypeCreateDTO {

    @Schema(description = "Dictionary code", example = "device_status")
    @NotBlank(message = "字典编码不能为空")
    @Size(max = 64)
    private String code;

    @Schema(description = "Dictionary name", example = "Device Status")
    @NotBlank(message = "字典名称不能为空")
    @Size(max = 128)
    private String name;

    @Schema(description = "Whether enabled")
    private Boolean enabled;

    @Schema(description = "Description")
    @Size(max = 256)
    private String description;
}
