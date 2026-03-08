package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("dict_types")
public class DictType extends TenantEntity {

    private String code;
    private String name;
    @TableField("is_system")
    private Boolean systemFlag;
    private Boolean enabled;
    private String description;
    private Long createdBy;
}
