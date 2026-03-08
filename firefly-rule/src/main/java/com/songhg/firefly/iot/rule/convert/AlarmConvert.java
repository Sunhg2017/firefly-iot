package com.songhg.firefly.iot.rule.convert;

import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleCreateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleVO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordVO;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface AlarmConvert {

    AlarmConvert INSTANCE = Mappers.getMapper(AlarmConvert.class);

    AlarmRuleVO toRuleVO(AlarmRule entity);

    @Mapping(target = "enabled", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    AlarmRule toRuleEntity(AlarmRuleCreateDTO dto);

    void updateRuleEntity(AlarmRuleUpdateDTO dto, @MappingTarget AlarmRule entity);

    AlarmRecordVO toRecordVO(AlarmRecord entity);
}
