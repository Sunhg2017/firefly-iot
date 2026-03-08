package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("alarm_rules")
public class AlarmRule extends TenantEntity {

    private Long projectId;
    private String name;
    private String description;
    private Long productId;
    private Long deviceId;
    private AlarmLevel level;
    private String conditionExpr;
    private Boolean enabled;
    private String notifyConfig;
    private Long createdBy;
}
