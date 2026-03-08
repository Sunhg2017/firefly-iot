package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfigTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "roles", autoResultMap = true)
public class Role extends TenantEntity {

    private String code;
    private String name;
    private String description;
    private RoleType type;
    private DataScopeType dataScope;
    @TableField(typeHandler = DataScopeConfigTypeHandler.class)
    private DataScopeConfig dataScopeConfig;
    @TableField("is_system")
    private Boolean systemFlag;
    private RoleStatus status;
    private Long createdBy;
}
