package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.ShareStatus;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("share_policies")
public class SharePolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long ownerTenantId;
    private Long consumerTenantId;
    private String name;
    private String scope;
    private String dataPermissions;
    private String maskingRules;
    private String rateLimit;
    private String validity;
    private ShareStatus status;
    private Boolean auditEnabled;
    private Long createdBy;
    private Long approvedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
