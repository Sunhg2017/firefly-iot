package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("user_roles")
public class DataScopeUserRoleEntity {

    private Long id;
    private Long userId;
    private Long roleId;
    private Long projectId;
}
