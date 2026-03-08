package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_tags")
public class DeviceTag extends TenantEntity {

    private String tagKey;
    private String tagValue;
    private String color;
    private String description;
    private Integer deviceCount;
}
