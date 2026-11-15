package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 下行消息持久化 outbox 记录。
 */
@Data
@TableName("downlink_outbox")
public class DownlinkOutbox {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private String messageId;
    private String type;
    private String topic;
    private String payload;
    private String status;
    private Integer attempts;
    private Integer maxAttempts;
    private LocalDateTime nextRetryAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
