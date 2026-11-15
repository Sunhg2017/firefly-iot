package com.songhg.firefly.iot.data.dto.dashboard;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建 / 更新自定义看板请求体。
 */
@Data
@Schema(description = "自定义看板保存请求")
public class CustomDashboardSaveDTO {

    @NotBlank(message = "看板名称不能为空")
    @Size(max = 128, message = "看板名称过长")
    @Schema(description = "看板名称")
    private String name;

    @Size(max = 512, message = "看板说明过长")
    @Schema(description = "看板说明")
    private String description;

    @Size(max = 65536, message = "布局内容过长")
    @Schema(description = "布局 JSON 文本（组件数组）")
    private String layout;
}
