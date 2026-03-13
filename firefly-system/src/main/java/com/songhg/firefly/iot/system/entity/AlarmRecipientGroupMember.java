package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Alarm recipient group member mapping.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("alarm_recipient_group_members")
public class AlarmRecipientGroupMember extends TenantEntity {

    private Long groupId;
    private Long userId;
}
