package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Video channel view object.
 */
@Data
@Schema(description = "视频通道视图对象")
public class VideoChannelVO {

    @Schema(description = "通道记录编号")
    private Long id;

    @Schema(description = "视频设备编号")
    private Long videoDeviceId;

    @Schema(description = "通道编号")
    private String channelId;

    @Schema(description = "通道名称")
    private String name;

    @Schema(description = "厂商")
    private String manufacturer;

    @Schema(description = "型号")
    private String model;

    @Schema(description = "通道状态")
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
