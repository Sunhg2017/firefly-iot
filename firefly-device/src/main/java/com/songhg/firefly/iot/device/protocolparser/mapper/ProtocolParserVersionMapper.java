package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserVersion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ProtocolParserVersionMapper extends BaseMapper<ProtocolParserVersion> {

    @Select("""
            SELECT *
            FROM protocol_parser_versions
            WHERE definition_id = #{definitionId}
              AND version_no = #{versionNo}
            LIMIT 1
            """)
    ProtocolParserVersion selectByDefinitionIdAndVersionNo(@Param("definitionId") Long definitionId,
                                                           @Param("versionNo") Integer versionNo);

    @Select("""
            SELECT COALESCE(MAX(version_no), 0)
            FROM protocol_parser_versions
            WHERE definition_id = #{definitionId}
            """)
    Integer selectMaxVersionNo(@Param("definitionId") Long definitionId);
}
