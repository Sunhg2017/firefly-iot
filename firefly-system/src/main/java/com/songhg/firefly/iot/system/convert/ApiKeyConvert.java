package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.apikey.ApiKeyUpdateDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyVO;
import com.songhg.firefly.iot.system.entity.ApiKey;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ApiKeyConvert {

    ApiKeyConvert INSTANCE = Mappers.getMapper(ApiKeyConvert.class);

    @Mapping(target = "openApiCodes", ignore = true)
    ApiKeyVO toVO(ApiKey entity);

    @Mapping(target = "scopes", ignore = true)
    void updateEntity(ApiKeyUpdateDTO dto, @MappingTarget ApiKey entity);
}
