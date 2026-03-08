package com.songhg.firefly.iot.device.dto.devicedata;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.EventLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Device event paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备事件分页查询")
public class DeviceEventQueryDTO extends PageQuery {

    @Schema(description = "设备编号筛选")
    private Long deviceId;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "事件类型筛选", example = "alarm")
    private String eventType;

    @Schema(description = "事件级别筛选")
    private EventLevel level;

    @Schema(description = "开始时间")
    private String startTime;

    @Schema(description = "结束时间")
    private String endTime;
}
