package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;
import org.apache.ibatis.type.JdbcType;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("tenant_quotas")
public class TenantQuota implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long tenantId;
    private Integer maxDevices;
    private Integer maxMsgPerSec;
    private Integer maxRules;
    private Integer dataRetentionDays;
    private Integer maxOtaStorageGb;
    private Integer maxApiCallsDay;
    private Integer maxUsers;
    private Integer maxProjects;
    private Integer maxVideoChannels;
    private Integer maxVideoStorageGb;
    private Integer maxSharePolicies;
    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String customConfig;    // JSONB
    private LocalDateTime updatedAt;
}
