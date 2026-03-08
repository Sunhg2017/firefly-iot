package com.songhg.firefly.iot.support.notification.convert;

import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateCreateDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateUpdateDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateVO;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface MessageTemplateConvert {

    MessageTemplateConvert INSTANCE = Mappers.getMapper(MessageTemplateConvert.class);

    MessageTemplateVO toVO(MessageTemplate entity);

    MessageTemplate toEntity(MessageTemplateCreateDTO dto);

    void updateEntity(MessageTemplateUpdateDTO dto, @MappingTarget MessageTemplate entity);
}
