package com.songhg.firefly.iot.device.dto.devicelog;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * Device log paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备日志分页查询")
public class DeviceLogQueryDTO extends PageQuery {

    @Schema(description = "设备编号筛选")
    private Long deviceId;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "日志级别筛选")
    private String level;

    @Schema(description = "模块筛选")
    private String module;

    @Schema(description = "内容关键词")
    private String keyword;

    @Schema(description = "开始时间")
    private LocalDateTime start;

    @Schema(description = "结束时间")
    private LocalDateTime end;
}
