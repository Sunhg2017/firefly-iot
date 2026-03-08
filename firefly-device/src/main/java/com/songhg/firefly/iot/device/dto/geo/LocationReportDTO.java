package com.songhg.firefly.iot.device.dto.geo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Device location report request.
 */
@Data
@Schema(description = "设备位置上报请求")
public class LocationReportDTO {

    @Schema(description = "设备编号")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    @Schema(description = "经度", example = "116.397128")
    @NotNull(message = "经度不能为空")
    private Double lng;

    @Schema(description = "纬度", example = "39.916527")
    @NotNull(message = "纬度不能为空")
    private Double lat;

    @Schema(description = "海拔（米）")
    private Double altitude;

    @Schema(description = "速度（米每秒）")
    private Double speed;

    @Schema(description = "航向角")
    private Double heading;

    @Schema(description = "定位来源", example = "GPS")
    private String source;
}
