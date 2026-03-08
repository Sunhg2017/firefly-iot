package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.OauthProvider;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;
import org.apache.ibatis.type.JdbcType;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("user_oauth_bindings")
public class UserOauthBinding implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long tenantId;
    private OauthProvider provider;
    private String openId;
    private String unionId;
    private String appId;
    private String nickname;
    private String avatarUrl;
    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String rawData;         // JSONB
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
