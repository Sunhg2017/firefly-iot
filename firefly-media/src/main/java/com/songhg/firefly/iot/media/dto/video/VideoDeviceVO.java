package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Video device view object.
 */
@Data
@Schema(description = "视频设备视图对象")
public class VideoDeviceVO {

    @Schema(description = "视频设备编号")
    private Long id;

    @Schema(description = "租户编号")
    private Long tenantId;

    @Schema(description = "关联设备编号")
    private Long deviceId;

    @Schema(description = "设备名称")
    private String name;

    @Schema(description = "国标设备编号")
    private String gbDeviceId;

    @Schema(description = "国标域")
    private String gbDomain;

    @Schema(description = "传输协议")
    private String transport;

    @Schema(description = "流模式")
    private StreamMode streamMode;

    @Schema(description = "网络地址")
    private String ip;

    @Schema(description = "端口")
    private Integer port;

    @Schema(description = "厂商")
    private String manufacturer;

    @Schema(description = "型号")
    private String model;

    @Schema(description = "固件版本")
    private String firmware;

    @Schema(description = "设备状态")
    private VideoDeviceStatus status;

    @Schema(description = "最近注册时间")
    private LocalDateTime lastRegisteredAt;

    @Schema(description = "创建人编号")
    private Long createdBy;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
