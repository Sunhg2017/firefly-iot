package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Alarm rule update request.
 */
@Data
@Schema(description = "Alarm rule update request")
public class AlarmRuleUpdateDTO {

    @Schema(description = "Rule name")
    private String name;

    @Schema(description = "Rule description")
    private String description;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Derived primary alarm level")
    private AlarmLevel level;

    @Schema(description = "Structured condition expression JSON")
    private String conditionExpr;

    @Schema(description = "Enabled flag")
    private Boolean enabled;

    @Schema(description = "Notification config JSON")
    private String notifyConfig;
}
