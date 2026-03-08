package com.songhg.firefly.iot.system.dto.dict;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Dictionary item update request.
 */
@Data
@Schema(description = "Dictionary item update request")
public class DictItemUpdateDTO {

    @Schema(description = "Item label")
    @Size(max = 128)
    private String itemLabel;

    @Schema(description = "Secondary label")
    @Size(max = 128)
    private String itemLabel2;

    @Schema(description = "Sort order")
    private Integer sortOrder;

    @Schema(description = "Whether enabled")
    private Boolean enabled;

    @Schema(description = "CSS class for styling")
    private String cssClass;

    @Schema(description = "Description")
    @Size(max = 256)
    private String description;
}
