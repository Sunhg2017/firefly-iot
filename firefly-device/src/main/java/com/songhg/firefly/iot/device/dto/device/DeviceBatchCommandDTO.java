package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备批量命令请求")
public class DeviceBatchCommandDTO extends DeviceBatchOperationDTO {

    @Schema(description = "命令类型：PROPERTY_SET / SERVICE_INVOKE", requiredMode = Schema.RequiredMode.REQUIRED)
    private String commandType;

    @Schema(description = "属性设置内容")
    private Map<String, Object> payload;

    @Schema(description = "服务名称（SERVICE_INVOKE）")
    private String serviceName;

    @Schema(description = "服务参数（SERVICE_INVOKE）")
    private Map<String, Object> params;
}
