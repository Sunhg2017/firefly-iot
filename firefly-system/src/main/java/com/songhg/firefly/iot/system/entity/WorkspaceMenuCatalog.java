package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("workspace_menu_catalog")
public class WorkspaceMenuCatalog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String workspaceScope;
    private String menuKey;
    private String parentMenuKey;
    private String label;
    private String icon;
    private String routePath;
    private String menuType;
    private Integer sortOrder;
    private Boolean visible;
    private Boolean roleCatalogVisible;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
