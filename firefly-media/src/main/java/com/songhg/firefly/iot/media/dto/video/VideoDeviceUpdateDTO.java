package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.enums.StreamMode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Video device update request.
 */
@Data
@Schema(description = "视频设备更新请求")
public class VideoDeviceUpdateDTO {

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
}
