package com.songhg.firefly.iot.device.dto.ota;

import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import com.songhg.firefly.iot.common.enums.OtaTaskType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * OTA upgrade task view object.
 */
@Data
@Schema(description = "OTA upgrade task view object")
public class OtaTaskVO {

    @Schema(description = "Task ID")
    private Long id;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Firmware ID")
    private Long firmwareId;

    @Schema(description = "Task name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Task type")
    private OtaTaskType taskType;

    @Schema(description = "Source version filter")
    private String srcVersion;

    @Schema(description = "Target version")
    private String destVersion;

    @Schema(description = "Task status")
    private OtaTaskStatus status;

    @Schema(description = "Total device count")
    private Integer totalCount;

    @Schema(description = "Successfully upgraded count")
    private Integer successCount;

    @Schema(description = "Failed upgrade count")
    private Integer failureCount;

    @Schema(description = "Gray release ratio (1-100)")
    private Integer grayRatio;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Task start time")
    private LocalDateTime startedAt;

    @Schema(description = "Task finish time")
    private LocalDateTime finishedAt;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Device upgrade details")
    private List<OtaTaskDeviceVO> devices;
}
