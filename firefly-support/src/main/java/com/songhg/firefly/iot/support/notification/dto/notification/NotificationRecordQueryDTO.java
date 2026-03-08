package com.songhg.firefly.iot.support.notification.dto.notification;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 通知记录分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "通知记录分页查询请求")
public class NotificationRecordQueryDTO extends PageQuery {

    @Schema(description = "渠道类型筛选")
    private String channelType;

    @Schema(description = "模板编码筛选")
    private String templateCode;

    @Schema(description = "状态筛选")
    private String status;

    @Schema(description = "搜索关键字")
    private String keyword;
}
