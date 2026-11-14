package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 远程配置版本（不可变快照）。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "device_remote_config_version", autoResultMap = true)
public class RemoteConfigVersion extends TenantEntity {

    private Long configId;
    private Integer version;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String configJson;
    private Long createdBy;
}
