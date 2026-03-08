package com.songhg.firefly.iot.rule.dto.alarm;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Alarm process request.
 */
@Data
@Schema(description = "告警处理请求")
public class AlarmProcessDTO {

    @Schema(description = "处理备注")
    private String processRemark;
}
