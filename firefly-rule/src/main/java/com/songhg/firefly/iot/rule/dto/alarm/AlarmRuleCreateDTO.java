package com.songhg.firefly.iot.rule.dto.alarm;

import com.songhg.firefly.iot.common.enums.AlarmLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Alarm rule creation request.
 */
@Data
@Schema(description = "告警规则创建请求")
public class AlarmRuleCreateDTO {

    @Schema(description = "规则名称", example = "设备温度过高")
    @NotBlank(message = "告警规则名称不能为空")
    @Size(max = 256)
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
    @NotNull(message = "告警级别不能为空")
    private AlarmLevel level;

    @Schema(description = "条件表达式")
    @NotBlank(message = "告警条件不能为空")
    private String conditionExpr;

    @Schema(description = "通知配置")
    private String notifyConfig;
}
