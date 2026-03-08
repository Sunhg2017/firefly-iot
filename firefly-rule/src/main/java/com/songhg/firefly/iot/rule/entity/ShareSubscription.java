package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("share_subscriptions")
public class ShareSubscription implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long policyId;
    private Long consumerTenantId;
    private String kafkaTopic;
    private String status;
    private LocalDateTime createdAt;
}
