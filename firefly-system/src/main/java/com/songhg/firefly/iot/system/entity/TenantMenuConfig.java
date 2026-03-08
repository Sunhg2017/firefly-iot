package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("tenant_menu_configs")
public class TenantMenuConfig extends TenantEntity {

    private static final long serialVersionUID = 1L;

    private Long parentId;
    private String menuKey;
    private String label;
    private String icon;
    private String routePath;
    private Integer sortOrder;
    private Boolean visible;
    private Long createdBy;
}
