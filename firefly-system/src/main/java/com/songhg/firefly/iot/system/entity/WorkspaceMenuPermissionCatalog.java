package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("workspace_menu_permission_catalog")
public class WorkspaceMenuPermissionCatalog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String workspaceScope;
    private String moduleKey;
    private String moduleLabel;
    private String menuPath;
    private String permissionCode;
    private String permissionLabel;
    private Integer moduleSortOrder;
    private Integer permissionSortOrder;
    private Boolean roleCatalogVisible;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
