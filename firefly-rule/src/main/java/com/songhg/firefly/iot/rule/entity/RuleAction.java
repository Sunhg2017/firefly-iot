package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("rule_actions")
public class RuleAction {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long ruleId;
    private RuleActionType actionType;
    private String actionConfig;
    private Integer sortOrder;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
