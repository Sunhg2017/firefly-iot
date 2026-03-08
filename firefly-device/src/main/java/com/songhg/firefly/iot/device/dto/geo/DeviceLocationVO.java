package com.songhg.firefly.iot.device.dto.geo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device location record view object.
 */
@Data
@Schema(description = "Device location record")
public class DeviceLocationVO {

    @Schema(description = "Record ID")
    private Long id;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Longitude", example = "116.397128")
    private Double lng;

    @Schema(description = "Latitude", example = "39.916527")
    private Double lat;

    @Schema(description = "Altitude in meters")
    private Double altitude;

    @Schema(description = "Speed (m/s)")
    private Double speed;

    @Schema(description = "Heading (degrees 0-360)")
    private Double heading;

    @Schema(description = "Location source (GPS / WIFI / LBS)", example = "GPS")
    private String source;

    @Schema(description = "Device-side reported time")
    private LocalDateTime reportedAt;

    @Schema(description = "Server creation time")
    private LocalDateTime createdAt;
}
