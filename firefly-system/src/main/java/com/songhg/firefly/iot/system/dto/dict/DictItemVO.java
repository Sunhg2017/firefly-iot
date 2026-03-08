package com.songhg.firefly.iot.system.dto.dict;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Dictionary item view object.
 */
@Data
@Schema(description = "字典项视图对象")
public class DictItemVO {

    @Schema(description = "字典项编号")
    private Long id;

    @Schema(description = "字典类型编号")
    private Long dictTypeId;

    @Schema(description = "字典项值")
    private String itemValue;

    @Schema(description = "字典项标签")
    private String itemLabel;

    @Schema(description = "字典项副标签")
    private String itemLabel2;

    @Schema(description = "排序")
    private Integer sortOrder;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "样式类")
    private String cssClass;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "最近更新时间")
    private LocalDateTime updatedAt;
}
