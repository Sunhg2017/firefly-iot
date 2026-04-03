package com.songhg.firefly.iot.rule.dto.share;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "共享设备视图")
public class SharedDeviceVO {

    @Schema(description = "共享策略编号")
    private Long policyId;

    @Schema(description = "共享策略名称")
    private String policyName;

    @Schema(description = "所有方租户编号")
    private Long ownerTenantId;

    @Schema(description = "设备编号")
    private Long deviceId;

    @Schema(description = "设备名称")
    private String deviceName;

    @Schema(description = "设备别名")
    private String nickname;

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "产品标识")
    private String productKey;

    @Schema(description = "产品名称")
    private String productName;

    @Schema(description = "设备状态")
    private String status;

    @Schema(description = "在线状态")
    private String onlineStatus;
}
