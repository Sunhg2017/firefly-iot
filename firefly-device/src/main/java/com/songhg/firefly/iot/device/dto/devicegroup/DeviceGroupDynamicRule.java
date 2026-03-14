package com.songhg.firefly.iot.device.dto.devicegroup;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * Structured JSON rule persisted in device_groups.dynamic_rule.
 */
@Data
@Schema(description = "Dynamic device group rule")
public class DeviceGroupDynamicRule {

    @Schema(description = "Condition match mode", example = "ALL")
    private String matchMode;

    @Schema(description = "Condition list")
    private List<DeviceGroupDynamicCondition> conditions;
}
