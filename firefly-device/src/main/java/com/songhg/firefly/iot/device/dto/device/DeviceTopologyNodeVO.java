package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Device topology node view.
 */
@Data
@Schema(description = "设备拓扑节点")
public class DeviceTopologyNodeVO {

    @Schema(description = "设备主键")
    private Long id;

    @Schema(description = "产品主键")
    private Long productId;

    @Schema(description = "设备名称")
    private String deviceName;

    @Schema(description = "设备别名")
    private String nickname;

    @Schema(description = "产品名称")
    private String productName;

    @Schema(description = "产品 Key")
    private String productKey;

    @Schema(description = "节点类型")
    private NodeType nodeType;

    @Schema(description = "设备状态")
    private DeviceStatus status;

    @Schema(description = "在线状态")
    private OnlineStatus onlineStatus;

    @Schema(description = "固件版本")
    private String firmwareVersion;

    @Schema(description = "IP 地址")
    private String ipAddress;

    @Schema(description = "所属网关设备主键")
    private Long gatewayId;

    @Schema(description = "所属网关设备名称")
    private String gatewayDeviceName;

    @Schema(description = "直属子设备数")
    private Integer directChildCount;

    @Schema(description = "子树总节点数（不含自身）")
    private Integer descendantCount;

    @Schema(description = "是否命中当前筛选条件")
    private boolean matched;

    @Schema(description = "是否为断链节点")
    private boolean orphan;

    @Schema(description = "最后在线时间")
    private LocalDateTime lastOnlineAt;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "子节点")
    private List<DeviceTopologyNodeVO> children;
}
