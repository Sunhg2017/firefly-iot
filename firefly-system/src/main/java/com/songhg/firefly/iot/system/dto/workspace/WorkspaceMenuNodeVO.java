package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "工作空间菜单节点")
public class WorkspaceMenuNodeVO {

    @Schema(description = "所属空间")
    private String workspaceScope;

    @Schema(description = "菜单唯一键")
    private String menuKey;

    @Schema(description = "父级菜单键")
    private String parentMenuKey;

    @Schema(description = "菜单名称")
    private String label;

    @Schema(description = "图标名称")
    private String icon;

    @Schema(description = "前端路由")
    private String routePath;

    @Schema(description = "菜单类型: GROUP/PAGE")
    private String menuType;

    @Schema(description = "排序")
    private Integer sortOrder;

    @Schema(description = "是否显示")
    private Boolean visible;

    @Schema(description = "是否在角色权限目录中展示")
    private Boolean roleCatalogVisible;

    @Schema(description = "当前租户是否已授权该菜单")
    private Boolean selected;

    @Schema(description = "菜单权限集合")
    private List<WorkspaceMenuPermissionVO> permissions = new ArrayList<>();

    @Schema(description = "子菜单")
    private List<WorkspaceMenuNodeVO> children = new ArrayList<>();
}
