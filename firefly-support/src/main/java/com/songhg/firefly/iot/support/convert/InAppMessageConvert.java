package com.songhg.firefly.iot.support.convert;

import com.songhg.firefly.iot.support.dto.message.InAppMessageVO;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface InAppMessageConvert {

    InAppMessageConvert INSTANCE = Mappers.getMapper(InAppMessageConvert.class);

    InAppMessageVO toVO(InAppMessage entity);
}
