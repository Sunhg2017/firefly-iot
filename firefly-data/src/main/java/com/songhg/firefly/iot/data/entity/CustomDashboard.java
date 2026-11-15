package com.songhg.firefly.iot.data.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 自定义看板 / 运营大屏配置。
 */
@Data
@TableName("custom_dashboards")
public class CustomDashboard {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String slug;
    private String name;
    private String description;
    /** 布局 JSON 文本（组件数组），前端负责解析与渲染。 */
    private String layout;
    private Boolean shareEnabled;
    private String shareToken;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
