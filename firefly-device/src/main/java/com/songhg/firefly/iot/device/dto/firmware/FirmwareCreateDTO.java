package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Firmware creation request.
 */
@Data
@Schema(description = "固件创建请求")
public class FirmwareCreateDTO {

    @Schema(description = "产品编号")
    @NotNull(message = "产品ID不能为空")
    private Long productId;

    @Schema(description = "固件版本", example = "1.2.0")
    @NotBlank(message = "版本号不能为空")
    @Size(max = 32)
    private String version;

    @Schema(description = "显示名称", example = "传感器固件1.2")
    @Size(max = 128)
    private String displayName;

    @Schema(description = "描述")
    @Size(max = 512)
    private String description;

    @Schema(description = "固件文件地址")
    @NotBlank(message = "文件URL不能为空")
    private String fileUrl;

    @Schema(description = "文件大小（字节）")
    private Long fileSize;

    @Schema(description = "文件校验值")
    private String md5Checksum;
}
