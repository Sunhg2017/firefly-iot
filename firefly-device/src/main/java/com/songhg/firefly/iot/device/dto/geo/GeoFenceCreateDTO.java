package com.songhg.firefly.iot.device.dto.geo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Geo-fence creation request.
 */
@Data
@Schema(description = "围栏创建请求")
public class GeoFenceCreateDTO {

    @Schema(description = "围栏名称", example = "仓库A区")
    @NotBlank(message = "围栏名称不能为空")
    @Size(max = 64)
    private String name;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;

    @Schema(description = "围栏类型", example = "CIRCLE")
    @NotBlank(message = "围栏类型不能为空")
    private String fenceType;

    @Schema(description = "多边形或矩形坐标")
    private String coordinates;

    @Schema(description = "圆心经度", example = "116.397128")
    private Double centerLng;

    @Schema(description = "圆心纬度", example = "39.916527")
    private Double centerLat;

    @Schema(description = "半径（米）", example = "500.0")
    private Double radius;

    @Schema(description = "触发类型", example = "BOTH")
    private String triggerType;

    @Schema(description = "是否启用", example = "true")
    private Boolean enabled;
}
