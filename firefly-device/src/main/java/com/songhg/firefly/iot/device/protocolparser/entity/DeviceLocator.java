package com.songhg.firefly.iot.device.protocolparser.entity;

import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_locators")
public class DeviceLocator extends TenantEntity {

    private Long productId;
    private Long deviceId;
    private String locatorType;
    private String locatorValue;
    private Boolean isPrimary;

    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
