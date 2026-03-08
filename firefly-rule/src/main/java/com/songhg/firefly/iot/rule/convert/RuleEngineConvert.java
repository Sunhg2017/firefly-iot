package com.songhg.firefly.iot.rule.convert;

import com.songhg.firefly.iot.rule.dto.ruleengine.RuleActionDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineCreateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineUpdateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineVO;
import com.songhg.firefly.iot.rule.entity.RuleAction;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface RuleEngineConvert {

    RuleEngineConvert INSTANCE = Mappers.getMapper(RuleEngineConvert.class);

    @Mapping(target = "actions", ignore = true)
    RuleEngineVO toVO(RuleEngine entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "triggerCount", ignore = true)
    @Mapping(target = "successCount", ignore = true)
    @Mapping(target = "errorCount", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    RuleEngine toEntity(RuleEngineCreateDTO dto);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "triggerCount", ignore = true)
    @Mapping(target = "successCount", ignore = true)
    @Mapping(target = "errorCount", ignore = true)
    void updateEntity(RuleEngineUpdateDTO dto, @MappingTarget RuleEngine entity);

    RuleActionDTO toActionDTO(RuleAction entity);

    @Mapping(target = "ruleId", ignore = true)
    RuleAction toActionEntity(RuleActionDTO dto);
}
