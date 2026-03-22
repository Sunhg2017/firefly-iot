package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * Device topology view.
 */
@Data
@Schema(description = "设备拓扑视图")
public class DeviceTopologyVO {

    @Schema(description = "拓扑概览")
    private DeviceTopologyOverviewVO overview;

    @Schema(description = "拓扑根节点")
    private List<DeviceTopologyNodeVO> rootNodes;

    @Schema(description = "独立设备")
    private List<DeviceTopologyNodeVO> standaloneDevices;

    @Schema(description = "断链设备")
    private List<DeviceTopologyNodeVO> orphanDevices;
}
