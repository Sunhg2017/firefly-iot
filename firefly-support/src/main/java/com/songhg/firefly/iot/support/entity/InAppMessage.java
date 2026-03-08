package com.songhg.firefly.iot.support.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "in_app_messages", excludeProperty = {"updatedAt"})
public class InAppMessage extends TenantEntity {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String title;
    private String content;
    private String type;
    private String level;
    private Boolean isRead;
    private LocalDateTime readAt;
    private String source;
    private String sourceId;
    private Long createdBy;
}
