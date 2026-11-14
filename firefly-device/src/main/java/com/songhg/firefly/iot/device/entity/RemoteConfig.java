package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.RemoteConfigStatus;
import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备远程配置模板。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "device_remote_config", autoResultMap = true)
public class RemoteConfig extends TenantEntity {

    private Long projectId;
    private String name;
    private String description;
    private RemoteConfigTargetType targetType;
    private Long targetId;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String configJson;
    private Integer version;
    private RemoteConfigStatus status;
    private Long createdBy;
}
