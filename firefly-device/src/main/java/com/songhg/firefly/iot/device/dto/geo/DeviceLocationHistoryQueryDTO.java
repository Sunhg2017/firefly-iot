package com.songhg.firefly.iot.device.dto.geo;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 设备位置历史分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备位置历史分页查询请求")
public class DeviceLocationHistoryQueryDTO extends PageQuery {

    @Schema(description = "开始时间")
    private LocalDateTime start;

    @Schema(description = "结束时间")
    private LocalDateTime end;
}
