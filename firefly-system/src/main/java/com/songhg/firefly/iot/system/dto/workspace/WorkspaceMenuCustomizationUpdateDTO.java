package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "当前工作空间菜单个性化配置更新请求")
public class WorkspaceMenuCustomizationUpdateDTO {

    @Schema(description = "自定义菜单名称")
    @NotBlank(message = "菜单名称不能为空")
    private String label;

    @Schema(description = "自定义父级菜单业务唯一键，留空表示顶级")
    private String parentMenuKey;

    @Schema(description = "自定义排序")
    private Integer sortOrder;
}
