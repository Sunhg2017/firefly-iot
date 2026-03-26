package com.songhg.firefly.iot.device.dto.video;

import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "视频通道视图")
public class DeviceVideoChannelVO {

    @Schema(description = "通道记录编号")
    private Long id;

    @Schema(description = "设备资产编号")
    private Long deviceId;

    @Schema(description = "通道编号")
    private String channelId;

    @Schema(description = "通道名称")
    private String name;

    @Schema(description = "厂商")
    private String manufacturer;

    @Schema(description = "型号")
    private String model;

    @Schema(description = "状态")
    private VideoDeviceStatus status;

    @Schema(description = "云台类型")
    private Integer ptzType;

    @Schema(description = "子通道数量")
    private Integer subCount;

    @Schema(description = "经度")
    private Double longitude;

    @Schema(description = "纬度")
    private Double latitude;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
