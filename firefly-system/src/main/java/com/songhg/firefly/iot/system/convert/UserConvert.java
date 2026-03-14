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
    UserVO toVO(User entity);

    @Mapping(target = "passwordHash", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "loginFailCount", ignore = true)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "tenantId", ignore = true)
    @Mapping(target = "userType", ignore = true)
    @Mapping(target = "passwordChangedAt", ignore = true)
    @Mapping(target = "lockUntil", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "lastLoginAt", ignore = true)
    @Mapping(target = "lastLoginIp", ignore = true)
    @Mapping(target = "lastLoginPlatform", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    User toEntity(UserCreateDTO dto);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "tenantId", ignore = true)
    @Mapping(target = "username", ignore = true)
    @Mapping(target = "passwordHash", ignore = true)
    @Mapping(target = "userType", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "passwordChangedAt", ignore = true)
    @Mapping(target = "loginFailCount", ignore = true)
    @Mapping(target = "lockUntil", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "lastLoginAt", ignore = true)
    @Mapping(target = "lastLoginIp", ignore = true)
    @Mapping(target = "lastLoginPlatform", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    void updateEntity(UserUpdateDTO dto, @MappingTarget User entity);
}
