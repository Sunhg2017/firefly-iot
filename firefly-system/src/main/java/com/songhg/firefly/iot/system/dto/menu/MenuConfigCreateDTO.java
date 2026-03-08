package com.songhg.firefly.iot.system.dto.menu;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Menu config creation request.
 */
@Data
@Schema(description = "Menu config creation request")
public class MenuConfigCreateDTO {

    @Schema(description = "Parent menu ID")
    private Long parentId;

    @Schema(description = "Menu key identifier", example = "device-mgmt")
    @NotBlank(message = "菜单标识不能为空")
    private String menuKey;

    @Schema(description = "Menu label", example = "Device Management")
    @NotBlank(message = "菜单名称不能为空")
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
