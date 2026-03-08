package com.songhg.firefly.iot.system.dto.menu;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Menu config sort request item.
 */
@Data
@Schema(description = "Menu config sort request item")
public class MenuConfigSortDTO {

    @Schema(description = "Menu ID")
    @NotNull(message = "菜单ID不能为空")
    private Long id;

    @Schema(description = "Parent menu ID")
    private Long parentId;

    @Schema(description = "Sort order")
    @NotNull(message = "排序序号不能为空")
    private Integer sortOrder;
}
