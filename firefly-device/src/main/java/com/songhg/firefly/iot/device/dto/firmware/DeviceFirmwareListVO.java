package com.songhg.firefly.iot.device.dto.firmware;

import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备固件总览视图。
 */
@Data
@Schema(description = "设备固件总览")
public class DeviceFirmwareListVO {

    @Schema(description = "设备编号")
    private Long deviceId;

    @Schema(description = "设备名称")
    private String deviceName;

    @Schema(description = "设备备注名")
    private String nickname;

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "产品标识")
    private String productKey;

    @Schema(description = "产品名称")
    private String productName;

    @Schema(description = "在线状态")
    private OnlineStatus onlineStatus;

    @Schema(description = "当前固件编号")
    private Long firmwareId;

    @Schema(description = "当前版本")
    private String currentVersion;

    @Schema(description = "目标版本")
    private String targetVersion;

    @Schema(description = "升级状态")
    private String upgradeStatus;

    @Schema(description = "升级进度")
    private Integer upgradeProgress;

    @Schema(description = "上次升级时间")
    private LocalDateTime lastUpgradeAt;

    @Schema(description = "最近更新时间")
    private LocalDateTime updatedAt;
}
