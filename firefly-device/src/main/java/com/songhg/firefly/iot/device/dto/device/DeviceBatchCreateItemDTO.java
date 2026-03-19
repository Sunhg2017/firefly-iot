package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "批量注册设备项")
public class DeviceBatchCreateItemDTO {

    @Schema(description = "设备名称", example = "SN20240301001")
    @NotBlank(message = "设备名称不能为空")
    @Size(max = 64)
    @Pattern(regexp = DeviceNameRules.REGEX, message = DeviceNameRules.MESSAGE)
    private String deviceName;

    @Schema(description = "设备别名", example = "仓库一号传感器")
    @Size(max = 256, message = "设备别名长度不能超过256")
    private String nickname;

    @Valid
    @Schema(description = "设备标识列表")
    private List<DeviceLocatorInputDTO> locators;
}
