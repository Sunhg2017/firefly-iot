package com.songhg.firefly.iot.rule.dataforward.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 数据流转规则：按消息源匹配 + 条件过滤，把设备数据转发到外部系统。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "data_forward_rules", autoResultMap = true)
public class DataForwardRule extends TenantEntity {

    private Long projectId;
    private String name;
    private String description;
    private String sourcePattern;
    private String matchCondition;
    private DataForwardTargetType targetType;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String targetConfig;
    private ForwardStatus status;
    private Long triggerCount;
    private Long successCount;
    private Long errorCount;
    private LocalDateTime lastTriggerAt;
    private Long createdBy;
}
