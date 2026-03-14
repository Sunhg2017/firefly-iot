package com.songhg.firefly.iot.device.dto.devicegroup;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * Structured condition used by dynamic device groups.
 */
@Data
@Schema(description = "Dynamic device group condition")
public class DeviceGroupDynamicCondition {

    @Schema(description = "Field name", example = "productKey")
    private String field;

    @Schema(description = "Operator", example = "IN")
    private String operator;

    @Schema(description = "Single comparison value")
    private String value;

    @Schema(description = "Multi-value comparison values")
    private List<String> values;

    @Schema(description = "Tag key used by HAS_TAG")
    private String tagKey;

    @Schema(description = "Tag value used by HAS_TAG, optional when only matching the key")
    private String tagValue;
}
