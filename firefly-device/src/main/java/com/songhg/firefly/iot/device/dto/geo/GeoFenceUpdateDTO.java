package com.songhg.firefly.iot.device.dto.geo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Geo-fence update request.
 */
@Data
@Schema(description = "围栏更新请求")
public class GeoFenceUpdateDTO {

    @Schema(description = "围栏名称")
    @Size(max = 64)
    private String name;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;

    @Schema(description = "围栏类型")
    private String fenceType;

    @Schema(description = "多边形或矩形坐标")
    private String coordinates;

    @Schema(description = "圆心经度")
    private Double centerLng;

    @Schema(description = "圆心纬度")
    private Double centerLat;

    @Schema(description = "半径（米）")
    private Double radius;

    @Schema(description = "触发类型")
    private String triggerType;

    @Schema(description = "是否启用")
    private Boolean enabled;
}
