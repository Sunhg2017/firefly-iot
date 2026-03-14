package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "系统菜单配置新增/编辑请求")
public class WorkspaceMenuCatalogUpsertDTO {

    @Schema(description = "所属空间", example = "PLATFORM")
    @NotBlank(message = "所属空间不能为空")
    private String workspaceScope;

    @Schema(description = "父级菜单键")
    private String parentMenuKey;

    @Schema(description = "菜单唯一键", example = "system-menu-permission")
    @NotBlank(message = "菜单唯一键不能为空")
    @Pattern(regexp = "^[A-Za-z0-9:_/-]{2,128}$", message = "菜单唯一键仅支持字母、数字、冒号、下划线、中划线和斜杠")
    private String menuKey;

    @Schema(description = "菜单名称")
    @NotBlank(message = "菜单名称不能为空")
    private String label;

    @Schema(description = "图标名称")
    private String icon;

    @Schema(description = "前端路由，目录节点留空")
    private String routePath;

    @Schema(description = "排序")
    private Integer sortOrder;

    @Schema(description = "是否显示")
    private Boolean visible;

    @Schema(description = "是否在角色权限目录中展示")
    private Boolean roleCatalogVisible;
}
