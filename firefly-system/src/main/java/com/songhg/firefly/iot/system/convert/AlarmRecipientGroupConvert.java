package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupCreateDTO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupVO;
import com.songhg.firefly.iot.system.entity.AlarmRecipientGroup;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;
import org.mapstruct.factory.Mappers;

@Mapper(
        nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
        unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface AlarmRecipientGroupConvert {

    AlarmRecipientGroupConvert INSTANCE = Mappers.getMapper(AlarmRecipientGroupConvert.class);

    AlarmRecipientGroupVO toVO(AlarmRecipientGroup entity);

    @Mapping(target = "code", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    AlarmRecipientGroup toEntity(AlarmRecipientGroupCreateDTO dto);

    void updateEntity(AlarmRecipientGroupCreateDTO dto, @MappingTarget AlarmRecipientGroup entity);
}
