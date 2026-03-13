package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Tenant-scoped alarm recipient group.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("alarm_recipient_groups")
public class AlarmRecipientGroup extends TenantEntity {

    private String code;
    private String name;
    private String description;
    private Long createdBy;
}
