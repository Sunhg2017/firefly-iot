package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "事件订阅分页查询")
public class EventSubscriptionQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "状态筛选")
    private ForwardStatus status;
}
