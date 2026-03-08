package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("rules")
public class RuleEngine extends TenantEntity {

    private Long projectId;
    private String name;
    private String description;
    private String sqlExpr;
    private RuleEngineStatus status;
    private Long triggerCount;
    private Long successCount;
    private Long errorCount;
    private LocalDateTime lastTriggerAt;
    private Long createdBy;
}
