package com.songhg.firefly.iot.device.protocolparser.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.apache.ibatis.type.JdbcType;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("protocol_parser_definitions")
public class ProtocolParserDefinition extends TenantEntity {

    private Long productId;
    private String scopeType;
    private Long scopeId;
    private String protocol;
    private String transport;
    private String direction;
    private String parserMode;
    private String frameMode;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String matchRuleJson;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String frameConfigJson;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String parserConfigJson;

    private String scriptLanguage;
    private String scriptContent;
    private String pluginId;
    private String pluginVersion;
    private Integer timeoutMs;
    private String errorPolicy;
    private String status;
    private Integer currentVersion;
    private Integer publishedVersion;
    private Long createdBy;

    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
