package com.songhg.firefly.iot.system.dto.dict;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Dictionary type update request.
 */
@Data
@Schema(description = "Dictionary type update request")
public class DictTypeUpdateDTO {

    @Schema(description = "Dictionary name")
    @Size(max = 128)
    private String name;

    @Schema(description = "Whether enabled")
    private Boolean enabled;

    @Schema(description = "Description")
    @Size(max = 256)
    private String description;
}
