package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Device topology query request.
 */
@Data
@Schema(description = "设备拓扑查询请求")
public class DeviceTopologyQueryDTO {

    @Schema(description = "关键字，匹配设备名称、别名、产品名称或产品 Key", example = "gateway")
    private String keyword;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "设备分组编号筛选")
    private Long groupId;

    @Schema(description = "项目编号筛选")
    private Long projectId;

    @Schema(description = "设备状态筛选")
    private DeviceStatus status;

    @Schema(description = "在线状态筛选")
    private OnlineStatus onlineStatus;
}
