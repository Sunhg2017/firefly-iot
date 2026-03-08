package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.base.BaseEntity;
import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.TenantPlan;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.apache.ibatis.type.JdbcType;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("tenants")
public class Tenant extends BaseEntity {

    private String code;
    private String name;
    private String displayName;
    private String description;
    private String logoUrl;
    private String contactName;
    private String contactPhone;
    private String contactEmail;
    private TenantPlan plan;
    private TenantStatus status;
    private IsolationLevel isolationLevel;
    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String isolationConfig; // JSONB as String
    private Long adminUserId;
    private LocalDateTime expireAt;
    private LocalDateTime suspendedAt;
    private String suspendedReason;
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
