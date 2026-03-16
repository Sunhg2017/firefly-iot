package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfigTypeHandler;
import lombok.Data;

@Data
@TableName("roles")
public class DataScopeRoleEntity {

    private Long id;
    private Long tenantId;
    private String code;
    private DataScopeType dataScope;
    @TableField(value = "data_scope_config", typeHandler = DataScopeConfigTypeHandler.class)
    private DataScopeConfig dataScopeConfig;
    private RoleStatus status;
}
