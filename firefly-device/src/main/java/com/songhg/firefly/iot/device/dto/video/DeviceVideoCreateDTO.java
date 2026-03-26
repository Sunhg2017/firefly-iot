package com.songhg.firefly.iot.device.dto.video;

import com.songhg.firefly.iot.common.enums.StreamMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "视频设备创建请求")
public class DeviceVideoCreateDTO {

    @Schema(description = "设备名称")
    @NotBlank(message = "设备名称不能为空")
    private String name;

    @Schema(description = "产品 ProductKey")
    @NotBlank(message = "产品不能为空")
    private String productKey;

    @Schema(description = "视频接入方式")
    @NotNull(message = "接入方式不能为空")
    private StreamMode streamMode;

    @Schema(description = "国标设备编号")
    private String gbDeviceId;

    @Schema(description = "国标域")
    private String gbDomain;

    @Schema(description = "传输方式")
    private String transport;

    @Schema(description = "是否启用 SIP 密码认证")
    private Boolean sipAuthEnabled;

    @Schema(description = "设备级 SIP 密码")
    @Size(max = 128)
    private String sipPassword;

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
}
