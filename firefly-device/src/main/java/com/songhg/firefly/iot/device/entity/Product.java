package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.DataFormat;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.ProductCategory;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.common.enums.ProtocolType;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("products")
public class Product extends TenantEntity {

    private Long projectId;
    private String productKey;
    private String productSecret;
    private String name;
    private String model;
    private String imageUrl;
    private String description;
    private ProductCategory category;
    private ProtocolType protocol;
    private String thingModel;
    private NodeType nodeType;
    private DataFormat dataFormat;
    private DeviceAuthType deviceAuthType;
    private ProductStatus status;
    private Integer deviceCount;
    private Long createdBy;
}
