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
            WHERE published_version IS NOT NULL
              AND status = 'ENABLED'
              AND deleted_at IS NULL
              AND (
                    (scope_type = 'PRODUCT' AND product_id = #{productId})
                 OR (scope_type = 'TENANT' AND scope_id = #{tenantId})
              )
            ORDER BY
              CASE WHEN scope_type = 'PRODUCT' THEN 0 ELSE 1 END,
              CASE WHEN release_mode = 'ALL' THEN 1 ELSE 0 END,
              updated_at DESC,
              id DESC
            """)
    List<ProtocolParserDefinition> selectPublishedByProductAndTenantIgnoreTenant(@Param("productId") Long productId,
                                                                                 @Param("tenantId") Long tenantId);
}
