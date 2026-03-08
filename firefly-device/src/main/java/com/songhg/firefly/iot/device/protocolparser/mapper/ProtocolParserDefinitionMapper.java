package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ProtocolParserDefinitionMapper extends BaseMapper<ProtocolParserDefinition> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM protocol_parser_definitions
            WHERE product_id = #{productId}
              AND published_version IS NOT NULL
              AND status = 'ENABLED'
              AND deleted_at IS NULL
            ORDER BY updated_at DESC, id DESC
            """)
    List<ProtocolParserDefinition> selectPublishedByProductIdIgnoreTenant(@Param("productId") Long productId);
}
