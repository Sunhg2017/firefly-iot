package com.songhg.firefly.iot.device.protocolparser.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.base.BaseEntity;
import com.songhg.firefly.iot.common.mybatis.JsonbStringTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.apache.ibatis.type.JdbcType;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("protocol_parser_versions")
public class ProtocolParserVersion extends BaseEntity {

    private Long definitionId;
    private Integer versionNo;

    @TableField(typeHandler = JsonbStringTypeHandler.class, jdbcType = JdbcType.OTHER)
    private String snapshotJson;

    private String publishStatus;
    private String changeLog;
    private Long createdBy;
}
