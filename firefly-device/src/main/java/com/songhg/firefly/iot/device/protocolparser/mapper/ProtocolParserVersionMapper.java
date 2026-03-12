package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserVersion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface ProtocolParserVersionMapper extends BaseMapper<ProtocolParserVersion> {

    ProtocolParserVersion selectByDefinitionIdAndVersionNo(@Param("definitionId") Long definitionId,
                                                           @Param("versionNo") Integer versionNo);

    Integer selectMaxVersionNo(@Param("definitionId") Long definitionId);

    List<ProtocolParserVersion> selectListByDefinitionId(@Param("definitionId") Long definitionId);

    List<ProtocolParserVersion> selectByDefinitionIdAndVersionNoPairs(
            @Param("pairs") List<Map<String, Object>> pairs);
}
