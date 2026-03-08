package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.ProjectStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("projects")
public class Project extends TenantEntity {

    private String code;
    private String name;
    private String description;
    private ProjectStatus status;
    private Long createdBy;
}
