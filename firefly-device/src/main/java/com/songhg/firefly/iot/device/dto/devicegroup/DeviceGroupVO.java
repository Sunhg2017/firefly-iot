package com.songhg.firefly.iot.device.dto.devicegroup;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Device group view object (supports tree structure).
 */
@Data
@Schema(description = "Device group view object")
public class DeviceGroupVO {

    @Schema(description = "Group ID")
    private Long id;

    @Schema(description = "Group name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Group type (STATIC / DYNAMIC)")
    private String type;

    @Schema(description = "Dynamic group rule expression")
    private String dynamicRule;

    @Schema(description = "Parent group ID (null = root)")
    private Long parentId;

    @Schema(description = "Number of devices in this group")
    private Integer deviceCount;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;

    /** 子分组（仅 tree 接口返回时填充） */
    @Schema(description = "Child groups (populated in tree API only)")
    private List<DeviceGroupVO> children;
}
