package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.permission.PermissionResourceCreateDTO;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceUpdateDTO;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceVO;
import com.songhg.firefly.iot.system.entity.PermissionResource;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface PermissionResourceConvert {

    PermissionResourceConvert INSTANCE = Mappers.getMapper(PermissionResourceConvert.class);

    @Mapping(target = "children", ignore = true)
    PermissionResourceVO toVO(PermissionResource entity);

    PermissionResource toEntity(PermissionResourceCreateDTO dto);

    void updateEntity(PermissionResourceUpdateDTO dto, @MappingTarget PermissionResource entity);
}
