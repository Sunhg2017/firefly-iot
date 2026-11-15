package com.songhg.firefly.iot.data.dto.dashboard;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 自定义看板视图对象：以 slug 作为业务唯一键，不暴露数据库主键。
 */
@Data
@Schema(description = "自定义看板视图对象")
public class CustomDashboardVO {

    @Schema(description = "看板业务唯一键（slug）")
    private String slug;

    @Schema(description = "看板名称")
    private String name;

    @Schema(description = "看板说明")
    private String description;

    @Schema(description = "布局 JSON 文本（组件数组）")
    private String layout;

    @Schema(description = "是否开启分享")
    private Boolean shareEnabled;

    @Schema(description = "分享令牌（开启分享后返回）")
    private String shareToken;

    @Schema(description = "更新时间")
    private LocalDateTime updatedAt;
}
