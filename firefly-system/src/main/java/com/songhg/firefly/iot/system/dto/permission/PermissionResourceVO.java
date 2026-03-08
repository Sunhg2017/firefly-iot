package com.songhg.firefly.iot.system.dto.permission;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Permission resource view object.
 */
@Data
@Schema(description = "权限资源视图对象")
public class PermissionResourceVO {

    @Schema(description = "资源编号")
    private Long id;

    @Schema(description = "父资源编号")
    private Long parentId;

    @Schema(description = "权限编码")
    private String code;

    @Schema(description = "权限名称")
    private String name;

    @Schema(description = "资源类型")
    private String type;

    @Schema(description = "图标名称")
    private String icon;

    @Schema(description = "资源路径")
    private String path;

    @Schema(description = "排序")
    private Integer sortOrder;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "最近更新时间")
    private LocalDateTime updatedAt;

    @Schema(description = "子资源")
    private List<PermissionResourceVO> children;
}
