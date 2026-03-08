package com.songhg.firefly.iot.device.dto.firmware;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备固件分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备固件分页查询请求")
public class DeviceFirmwareQueryDTO extends PageQuery {
}
