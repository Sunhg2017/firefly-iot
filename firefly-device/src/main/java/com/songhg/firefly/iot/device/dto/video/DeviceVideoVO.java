package com.songhg.firefly.iot.device.dto.video;

import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "视频设备视图")
public class DeviceVideoVO {

    @Schema(description = "设备资产编号")
    private Long id;

    @Schema(description = "产品编号")
    private Long productId;

    @Schema(description = "产品 ProductKey")
    private String productKey;

    @Schema(description = "产品名称")
    private String productName;

    @Schema(description = "设备名称")
    private String name;

    @Schema(description = "设备主键名称")
    private String deviceName;

    @Schema(description = "国标设备编号")
    private String gbDeviceId;

    @Schema(description = "国标域")
    private String gbDomain;

    @Schema(description = "传输方式")
    private String transport;

    @Schema(description = "是否启用认证")
    private Boolean authEnabled;

    @Schema(description = "认证用户名")
    private String authUsername;

    @Schema(description = "视频接入方式")
    private StreamMode streamMode;

    @Schema(description = "接入 IP")
    private String ip;

    @Schema(description = "接入端口")
    private Integer port;

    @Schema(description = "视频源地址")
    private String sourceUrl;

    @Schema(description = "厂商")
    private String manufacturer;

    @Schema(description = "型号")
    private String model;

    @Schema(description = "固件版本")
    private String firmware;

    @Schema(description = "视频在线状态")
    private VideoDeviceStatus status;

    @Schema(description = "最近注册时间")
    private LocalDateTime lastRegisteredAt;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
