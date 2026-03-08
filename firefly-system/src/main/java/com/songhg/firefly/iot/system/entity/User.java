package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("users")
public class User extends TenantEntity {

    private String username;
    private String passwordHash;
    private String phone;
    private String email;
    private String avatarUrl;
    private String realName;
    private UserType userType;
    private UserStatus status;
    private LocalDateTime passwordChangedAt;
    private Integer loginFailCount;
    private LocalDateTime lockUntil;
    private Long createdBy;
    private LocalDateTime lastLoginAt;
    private String lastLoginIp;
    private String lastLoginPlatform;
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
