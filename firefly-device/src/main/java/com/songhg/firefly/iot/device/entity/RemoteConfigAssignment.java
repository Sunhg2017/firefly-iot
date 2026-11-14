package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.RemoteConfigAssignmentStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 远程配置下发记录。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_remote_config_assignment")
public class RemoteConfigAssignment extends TenantEntity {

    private Long configId;
    private Integer configVersion;
    private Long deviceId;
    private RemoteConfigAssignmentStatus status;
    private String messageId;
    private String errorMessage;
}
