package com.songhg.firefly.iot.device.protocolparser.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.ParserDirection;
import com.songhg.firefly.iot.common.enums.ParserErrorPolicy;
import com.songhg.firefly.iot.common.enums.ParserFrameMode;
import com.songhg.firefly.iot.common.enums.ParserMode;
import com.songhg.firefly.iot.common.enums.ParserReleaseMode;
import com.songhg.firefly.iot.common.enums.ParserScopeType;
import com.songhg.firefly.iot.common.enums.ParserStatus;
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
    private ParserScopeType scopeType;
    private Long scopeId;
    private String protocol;
    private String transport;
    private ParserDirection direction;
    private ParserMode parserMode;
    private ParserFrameMode frameMode;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String matchRuleJson;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String frameConfigJson;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String parserConfigJson;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String visualConfigJson;

    private String scriptLanguage;
    private String scriptContent;
    private String pluginId;
    private String pluginVersion;
    private Integer timeoutMs;
    private ParserErrorPolicy errorPolicy;
    private ParserReleaseMode releaseMode;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String releaseConfigJson;

    private ParserStatus status;
    private Integer currentVersion;
    private Integer publishedVersion;
    private Long createdBy;

    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
