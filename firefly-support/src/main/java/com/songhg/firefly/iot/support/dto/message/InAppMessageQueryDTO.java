package com.songhg.firefly.iot.support.dto.message;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * In-app message paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "站内信分页查询")
public class InAppMessageQueryDTO extends PageQuery {

    @Schema(description = "消息类型筛选")
    private String type;

    @Schema(description = "已读状态筛选")
    private Boolean isRead;
}
