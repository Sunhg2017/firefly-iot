package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.RolePermission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Set;

@Mapper
public interface RolePermissionMapper extends BaseMapper<RolePermission> {

    Set<String> findPermissionsByUserId(@Param("userId") Long userId);
}
