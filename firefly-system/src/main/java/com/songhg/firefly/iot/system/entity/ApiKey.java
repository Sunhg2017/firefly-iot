package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;
import org.apache.ibatis.type.JdbcType;

import java.time.LocalDateTime;

@Data
@TableName("api_keys")
public class ApiKey {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String name;
    private String description;
    private String accessKey;
    private String secretKeyHash;
    private String secretKeyCiphertext;
    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String scopes;
    private Integer rateLimitPerMin;
    private Integer rateLimitPerDay;
    private ApiKeyStatus status;
    private LocalDateTime expireAt;
    private LocalDateTime lastUsedAt;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
