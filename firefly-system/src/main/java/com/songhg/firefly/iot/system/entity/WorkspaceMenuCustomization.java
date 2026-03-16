package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("workspace_menu_customizations")
public class WorkspaceMenuCustomization extends TenantEntity {

    private static final long serialVersionUID = 1L;

    private String workspaceScope;
    private String menuKey;
    private String parentMenuKey;
    private String label;
    private Integer sortOrder;
    private Long updatedBy;
}
