package com.songhg.firefly.iot.support.notification.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("notification_records")
public class NotificationRecord implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long channelId;
    private String channelType;
    private String templateCode;
    private String subject;
    private String content;
    private String recipient;
    private String status;
    private String errorMessage;
    private Integer retryCount;
    private LocalDateTime sentAt;
    private LocalDateTime createdAt;
}
