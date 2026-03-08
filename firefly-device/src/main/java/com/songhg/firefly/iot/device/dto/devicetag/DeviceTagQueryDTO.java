package com.songhg.firefly.iot.device.dto.devicetag;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备标签分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备标签分页查询请求")
public class DeviceTagQueryDTO extends PageQuery {

    @Schema(description = "搜索关键字（标签键/标签值）", example = "location")
    private String keyword;
}
