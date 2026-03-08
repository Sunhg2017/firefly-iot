package com.songhg.firefly.iot.device.dto.devicegroup;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备分组分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备分组分页查询请求")
public class DeviceGroupQueryDTO extends PageQuery {

    @Schema(description = "搜索关键字（分组名称）", example = "floor")
    private String keyword;
}
