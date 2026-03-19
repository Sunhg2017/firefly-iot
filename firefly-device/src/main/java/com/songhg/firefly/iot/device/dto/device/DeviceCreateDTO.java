package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Device creation request.
 */
@Data
@Schema(description = "设备创建请求")
public class DeviceCreateDTO {

    @Schema(description = "产品编号", example = "1")
    @NotNull(message = "产品ID不能为空")
    private Long productId;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "设备名称", example = "AA:BB:CC:DD:EE:FF")
    @NotBlank(message = "设备名称不能为空")
    @Size(max = 64)
    @Pattern(regexp = DeviceNameRules.REGEX, message = DeviceNameRules.MESSAGE)
    private String deviceName;

    @Schema(description = "显示名称", example = "仓库一号传感器")
    @Size(max = 256)
    private String nickname;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "标签，逗号分隔", example = "warehouse,floor-2")
    private List<Long> tagIds;

    @Valid
    @Schema(description = "设备标识列表")
    private List<DeviceLocatorInputDTO> locators;

    private List<Long> groupIds;
}
