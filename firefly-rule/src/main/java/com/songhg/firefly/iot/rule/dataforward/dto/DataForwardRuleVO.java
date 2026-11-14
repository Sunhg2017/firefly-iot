package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "数据流转规则视图")
public class DataForwardRuleVO {

    private Long id;
    private Long projectId;
    private String name;
    private String description;
    private String sourcePattern;
    private String matchCondition;
    private DataForwardTargetType targetType;
    private String targetConfig;
    private ForwardStatus status;
    private Long triggerCount;
    private Long successCount;
    private Long errorCount;
    private LocalDateTime lastTriggerAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
