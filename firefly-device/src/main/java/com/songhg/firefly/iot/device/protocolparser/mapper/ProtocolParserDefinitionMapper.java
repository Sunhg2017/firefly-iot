package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ProtocolParserDefinitionMapper extends BaseMapper<ProtocolParserDefinition> {

    @InterceptorIgnore(tenantLine = "true")
    List<ProtocolParserDefinition> selectPublishedByProductAndTenantIgnoreTenant(@Param("productId") Long productId,
                                                                                 @Param("tenantId") Long tenantId);
}
