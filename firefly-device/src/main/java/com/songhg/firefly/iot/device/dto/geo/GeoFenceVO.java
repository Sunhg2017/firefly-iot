package com.songhg.firefly.iot.device.dto.geo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Geo-fence view object.
 */
@Data
@Schema(description = "Geo-fence view object")
public class GeoFenceVO {

    @Schema(description = "Fence ID")
    private Long id;

    @Schema(description = "Fence name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Fence type (CIRCLE / POLYGON / RECTANGLE)")
    private String fenceType;

    @Schema(description = "Coordinates (JSON)")
    private String coordinates;

    @Schema(description = "Circle center longitude")
    private Double centerLng;

    @Schema(description = "Circle center latitude")
    private Double centerLat;

    @Schema(description = "Circle radius in meters")
    private Double radius;

    @Schema(description = "Trigger type (ENTER / LEAVE / BOTH)")
    private String triggerType;

    @Schema(description = "Whether the fence is enabled")
    private Boolean enabled;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
