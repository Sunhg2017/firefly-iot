package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Alarm rule creation request.
 */
@Data
@Schema(description = "Alarm rule creation request")
public class AlarmRuleCreateDTO {

    @Schema(description = "Rule name", example = "Temperature alert")
    @NotBlank(message = "Alarm rule name cannot be blank")
    @Size(max = 256)
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
    @NotBlank(message = "Alarm condition cannot be blank")
    private String conditionExpr;

    @Schema(description = "Notification config JSON")
    private String notifyConfig;
}
