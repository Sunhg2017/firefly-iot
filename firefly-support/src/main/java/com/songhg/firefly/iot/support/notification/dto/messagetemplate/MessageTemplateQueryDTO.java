package com.songhg.firefly.iot.support.notification.dto.messagetemplate;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 消息模板分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "消息模板分页查询请求")
public class MessageTemplateQueryDTO extends PageQuery {

    @Schema(description = "搜索关键字")
    private String keyword;

    @Schema(description = "渠道筛选")
    private String channel;

    @Schema(description = "模板类型筛选")
    private String templateType;

    @Schema(description = "启用状态筛选")
    private Boolean enabled;
}
