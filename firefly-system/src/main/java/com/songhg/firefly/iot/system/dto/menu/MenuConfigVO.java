package com.songhg.firefly.iot.system.dto.menu;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Menu config view object.
 */
@Data
@Schema(description = "Menu config view object")
public class MenuConfigVO {

    @Schema(description = "Menu ID")
    private Long id;

    @Schema(description = "Parent menu ID")
    private Long parentId;

    @Schema(description = "Menu key")
    private String menuKey;

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

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;

    @Schema(description = "Child menus")
    private List<MenuConfigVO> children;
}
