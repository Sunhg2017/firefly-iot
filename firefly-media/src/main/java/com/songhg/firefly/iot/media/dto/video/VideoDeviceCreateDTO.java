package com.songhg.firefly.iot.media.dto.video;
import com.songhg.firefly.iot.common.enums.StreamMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Video device creation request.
 */
@Data
@Schema(description = "视频设备创建请求")
public class VideoDeviceCreateDTO {

    @Schema(description = "设备名称")
    @NotBlank(message = "设备名称不能为空")
    private String name;

    @Schema(description = "关联设备编号")
    private Long deviceId;

    @Schema(description = "产品 ProductKey")
    private String productKey;

    @Schema(description = "国标设备编号")
    private String gbDeviceId;

    @Schema(description = "国标域")
    private String gbDomain;

    @Schema(description = "传输协议")
    private String transport;

    @Schema(description = "启用 SIP 密码鉴权")
    private Boolean sipAuthEnabled;

    @Schema(description = "SIP 密码")
    @Size(max = 128)
    private String sipPassword;

    @Schema(description = "流模式")
    @NotNull(message = "接入方式不能为空")
    private StreamMode streamMode;

    @Schema(description = "网络地址")
    private String ip;

    @Schema(description = "端口")
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
