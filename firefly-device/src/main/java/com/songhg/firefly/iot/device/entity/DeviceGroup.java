package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_groups")
public class DeviceGroup extends TenantEntity {

    private String name;
    private String description;
    private String type;
    private String dynamicRule;
    private Long parentId;
    private Integer deviceCount;
    private Long createdBy;
}
