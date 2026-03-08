package com.songhg.firefly.iot.support.notification.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("message_templates")
public class MessageTemplate extends TenantEntity {

    private String code;
    private String name;
    private String channel;
    private String templateType;
    private String subject;
    private String content;
    private String variables;
    private Boolean enabled;
    private String description;
    private Long createdBy;
}
