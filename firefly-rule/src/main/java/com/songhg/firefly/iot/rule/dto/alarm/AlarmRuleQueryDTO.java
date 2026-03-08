package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Alarm rule paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "告警规则分页查询")
public class AlarmRuleQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "告警级别筛选")
    private AlarmLevel level;

    @Schema(description = "启用状态筛选")
    private Boolean enabled;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "项目编号筛选")
    private Long projectId;
}
