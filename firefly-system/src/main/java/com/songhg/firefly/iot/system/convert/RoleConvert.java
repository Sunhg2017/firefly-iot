package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.role.RoleCreateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleUpdateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleVO;
import com.songhg.firefly.iot.system.entity.Role;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface RoleConvert {

    RoleConvert INSTANCE = Mappers.getMapper(RoleConvert.class);

    @Mapping(target = "permissions", ignore = true)
    @Mapping(target = "userCount", ignore = true)
    RoleVO toVO(Role entity);

    @Mapping(target = "type", ignore = true)
    @Mapping(target = "systemFlag", ignore = true)
    @Mapping(target = "status", ignore = true)
    Role toEntity(RoleCreateDTO dto);

    @Mapping(target = "code", ignore = true)
    @Mapping(target = "type", ignore = true)
    @Mapping(target = "systemFlag", ignore = true)
    void updateEntity(RoleUpdateDTO dto, @MappingTarget Role entity);
}
