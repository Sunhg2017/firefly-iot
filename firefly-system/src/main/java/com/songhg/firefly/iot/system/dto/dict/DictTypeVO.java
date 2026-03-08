package com.songhg.firefly.iot.system.dto.dict;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Dictionary type view object.
 */
@Data
@Schema(description = "字典类型视图对象")
public class DictTypeVO {

    @Schema(description = "字典类型编号")
    private Long id;

    @Schema(description = "字典编码")
    private String code;

    @Schema(description = "字典名称")
    private String name;

    @Schema(description = "是否系统内置")
    private Boolean systemFlag;

    @Schema(description = "是否启用")
    private Boolean enabled;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "创建人编号")
    private Long createdBy;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "最近更新时间")
    private LocalDateTime updatedAt;

    @Schema(description = "字典项列表")
    private List<DictItemVO> items;
}
