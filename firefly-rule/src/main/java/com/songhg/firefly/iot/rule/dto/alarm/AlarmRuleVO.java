package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Alarm rule view object.
 */
@Data
@Schema(description = "Alarm rule view object")
public class AlarmRuleVO {

    @Schema(description = "Rule ID")
    private Long id;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Rule name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Alarm level")
    private AlarmLevel level;

    @Schema(description = "Condition expression")
    private String conditionExpr;

    @Schema(description = "Enabled flag")
    private Boolean enabled;

    @Schema(description = "Notification config (JSON)")
    private String notifyConfig;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
