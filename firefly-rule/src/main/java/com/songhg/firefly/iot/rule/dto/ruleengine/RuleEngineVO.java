package com.songhg.firefly.iot.rule.dto.ruleengine;

import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Rule engine view object.
 */
@Data
@Schema(description = "Rule engine view object")
public class RuleEngineVO {

    @Schema(description = "Rule ID")
    private Long id;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Rule name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "SQL expression")
    private String sqlExpr;

    @Schema(description = "Status")
    private RuleEngineStatus status;

    @Schema(description = "Trigger count")
    private Long triggerCount;

    @Schema(description = "Success count")
    private Long successCount;

    @Schema(description = "Error count")
    private Long errorCount;

    @Schema(description = "Last trigger time")
    private LocalDateTime lastTriggerAt;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;

    @Schema(description = "Rule actions")
    private List<RuleActionDTO> actions;
}
