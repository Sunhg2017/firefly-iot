package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "设备三元组导出请求")
public class DeviceTripleExportDTO {

    @Schema(description = "设备ID列表")
    @Size(max = 1000, message = "单次最多导出1000台设备")
    private List<Long> deviceIds;

    @Schema(description = "关键字")
    private String keyword;

    @Schema(description = "产品ID")
    private Long productId;

    @Schema(description = "设备状态")
    private DeviceStatus status;

    @Schema(description = "在线状态")
    private OnlineStatus onlineStatus;
}
