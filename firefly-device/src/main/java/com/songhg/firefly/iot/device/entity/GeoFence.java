package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("geo_fences")
public class GeoFence extends TenantEntity {

    private String name;
    private String description;
    private String fenceType;
    private String coordinates;
    private Double centerLng;
    private Double centerLat;
    private Double radius;
    private String triggerType;
    private Boolean enabled;
    private Long createdBy;
}
