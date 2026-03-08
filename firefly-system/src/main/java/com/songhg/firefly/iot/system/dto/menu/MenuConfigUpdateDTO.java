package com.songhg.firefly.iot.system.dto.menu;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Menu config update request.
 */
@Data
@Schema(description = "Menu config update request")
public class MenuConfigUpdateDTO {

    @Schema(description = "Parent menu ID")
    private Long parentId;

    @Schema(description = "Menu label")
    private String label;

    @Schema(description = "Icon name")
    private String icon;

    @Schema(description = "Route path")
    private String routePath;

    @Schema(description = "Sort order")
    private Integer sortOrder;

    @Schema(description = "Visibility flag")
    private Boolean visible;
}
