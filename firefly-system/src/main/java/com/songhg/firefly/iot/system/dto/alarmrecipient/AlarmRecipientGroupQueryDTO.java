package com.songhg.firefly.iot.system.dto.alarmrecipient;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Alarm recipient group paged query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "Alarm recipient group paged query")
public class AlarmRecipientGroupQueryDTO extends PageQuery {

    @Schema(description = "Keyword search by name or description")
    private String keyword;
}
