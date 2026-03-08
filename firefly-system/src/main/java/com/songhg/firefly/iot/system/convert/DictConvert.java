package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.dict.DictItemCreateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictItemUpdateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictItemVO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeCreateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeUpdateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeVO;
import com.songhg.firefly.iot.system.entity.DictItem;
import com.songhg.firefly.iot.system.entity.DictType;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DictConvert {

    DictConvert INSTANCE = Mappers.getMapper(DictConvert.class);

    @Mapping(target = "items", ignore = true)
    DictTypeVO toTypeVO(DictType entity);

    DictType toTypeEntity(DictTypeCreateDTO dto);

    void updateTypeEntity(DictTypeUpdateDTO dto, @MappingTarget DictType entity);

    DictItemVO toItemVO(DictItem entity);

    DictItem toItemEntity(DictItemCreateDTO dto);

    void updateItemEntity(DictItemUpdateDTO dto, @MappingTarget DictItem entity);
}
