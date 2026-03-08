package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Tenant space menu assignment request.
 */
@Data
@Schema(description = "Tenant space menu assignment request")
public class TenantSpaceMenuAssignDTO {

    @Schema(description = "Parent menu key")
    private String parentMenuKey;

    @Schema(description = "Menu key", example = "device-mgmt")
    @NotBlank(message = "菜单标识不能为空")
    private String menuKey;

    @Schema(description = "Menu label", example = "设备中心")
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
