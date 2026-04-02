package com.songhg.firefly.iot.device.dto.firmware;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备固件总览分页查询请求。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备固件总览分页查询请求")
public class DeviceFirmwareListQueryDTO extends PageQuery {

    @Schema(description = "关键词，匹配设备名称或备注名")
    private String keyword;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "固件编号筛选")
    private Long firmwareId;

    @Schema(description = "在线状态筛选")
    private OnlineStatus onlineStatus;

    @Schema(description = "升级状态筛选")
    private String upgradeStatus;
}
