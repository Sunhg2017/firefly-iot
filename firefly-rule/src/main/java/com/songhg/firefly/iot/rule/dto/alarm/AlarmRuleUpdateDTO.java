package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Alarm rule update request.
 */
@Data
@Schema(description = "告警规则更新请求")
public class AlarmRuleUpdateDTO {

    @Schema(description = "规则名称")
    private String name;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "设备编号")
    private Long deviceId;

    @Schema(description = "告警级别")
    private AlarmLevel level;

    @Schema(description = "条件表达式")
    private String conditionExpr;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "通知配置")
    private String notifyConfig;
}
