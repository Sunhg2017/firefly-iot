package com.songhg.firefly.iot.device.dto.ota;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * OTA firmware update request.
 */
@Data
@Schema(description = "固件更新请求")
public class FirmwareUpdateDTO {

    @Schema(description = "显示名称")
    private String displayName;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "固件文件地址")
    private String fileUrl;

    @Schema(description = "文件大小（字节）")
    private Long fileSize;

    @Schema(description = "文件校验值")
    private String md5Checksum;
}
