package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Device topology overview.
 */
@Data
@Schema(description = "设备拓扑概览")
public class DeviceTopologyOverviewVO {

    @Schema(description = "命中筛选条件的设备数")
    private Integer matchedDevices;

    @Schema(description = "当前拓扑中展示的设备数")
    private Integer visibleDevices;

    @Schema(description = "拓扑根节点数")
    private Integer rootNodes;

    @Schema(description = "网关设备数")
    private Integer gatewayDevices;

    @Schema(description = "挂载在网关下的设备数")
    private Integer subDevices;

    @Schema(description = "独立设备数")
    private Integer standaloneDevices;

    @Schema(description = "断链设备数")
    private Integer orphanDevices;

    @Schema(description = "在线设备数")
    private Integer onlineDevices;

    @Schema(description = "最大拓扑深度")
    private Integer maxDepth;
}
