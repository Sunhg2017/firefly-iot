package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.tenant.TenantCreateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantUpdateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantVO;
import com.songhg.firefly.iot.system.entity.Tenant;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface TenantConvert {

    TenantConvert INSTANCE = Mappers.getMapper(TenantConvert.class);

    TenantVO toVO(Tenant entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "isolationConfig", ignore = true)
    Tenant toEntity(TenantCreateDTO dto);

    void updateEntity(TenantUpdateDTO dto, @MappingTarget Tenant entity);
}
