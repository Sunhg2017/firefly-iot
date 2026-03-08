package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Alarm record view object.
 */
@Data
@Schema(description = "Alarm record view object")
public class AlarmRecordVO {

    @Schema(description = "Record ID")
    private Long id;

    @Schema(description = "Alarm rule ID")
    private Long alarmRuleId;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Alarm level")
    private AlarmLevel level;

    @Schema(description = "Status")
    private AlarmStatus status;

    @Schema(description = "Alarm title")
    private String title;

    @Schema(description = "Alarm content")
    private String content;

    @Schema(description = "Trigger value")
    private String triggerValue;

    @Schema(description = "Confirmed by user ID")
    private Long confirmedBy;

    @Schema(description = "Confirmation time")
    private LocalDateTime confirmedAt;

    @Schema(description = "Processed by user ID")
    private Long processedBy;

    @Schema(description = "Process time")
    private LocalDateTime processedAt;

    @Schema(description = "Process remark")
    private String processRemark;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
