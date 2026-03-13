package com.songhg.firefly.iot.system.dto.alarmrecipient;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Alarm recipient group option for selectors.
 */
@Data
@Schema(description = "Alarm recipient group option")
public class AlarmRecipientGroupOptionVO {

    @Schema(description = "Group code", example = "ARG7F3A19C2")
    private String code;

    @Schema(description = "Group name", example = "值班一组")
    private String name;

    @Schema(description = "Member count", example = "3")
    private Integer memberCount;
}
