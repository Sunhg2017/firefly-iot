package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "批量注册设备请求")
public class DeviceBatchCreateDTO {

    @Schema(description = "产品ID", example = "1")
    @NotNull(message = "产品ID不能为空")
    private Long productId;

    @Schema(description = "项目ID")
    private Long projectId;

    @Schema(description = "批量注册设备列表")
    @Valid
    @NotEmpty(message = "设备列表不能为空")
    @Size(max = 200, message = "单次最多批量注册200台设备")
    private List<DeviceBatchCreateItemDTO> devices;

    @Schema(description = "统一描述")
    private String description;

    @Schema(description = "统一标签，逗号分隔")
    private List<Long> tagIds;
}
