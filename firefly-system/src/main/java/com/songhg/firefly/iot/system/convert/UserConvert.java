package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.user.UserCreateDTO;
import com.songhg.firefly.iot.system.dto.user.UserUpdateDTO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.entity.User;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface UserConvert {

    UserConvert INSTANCE = Mappers.getMapper(UserConvert.class);

    @Mapping(target = "roles", ignore = true)
    @Mapping(target = "tenantSuperAdmin", ignore = true)
    @Mapping(target = "workspaceMenuAdmin", ignore = true)
    UserVO toVO(User entity);

    @Mapping(target = "passwordHash", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "loginFailCount", ignore = true)
    User toEntity(UserCreateDTO dto);

    void updateEntity(UserUpdateDTO dto, @MappingTarget User entity);
}
