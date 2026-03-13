package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName(value = "rule_actions", autoResultMap = true)
public class RuleAction {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long ruleId;
    private RuleActionType actionType;
    @TableField(typeHandler = JsonbStringTypeHandler.class)
    private String actionConfig;
    private Integer sortOrder;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
