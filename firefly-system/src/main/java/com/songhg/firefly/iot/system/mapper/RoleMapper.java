package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.Role;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface RoleMapper extends BaseMapper<Role> {

    @Select("""
            SELECT DISTINCT r.code
            FROM users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN roles r ON r.id = ur.role_id
            WHERE u.id = #{userId}
              AND u.deleted_at IS NULL
              AND r.tenant_id = u.tenant_id
              AND r.status = 'ACTIVE'
              AND r.code IS NOT NULL
            """)
    List<String> findActiveRoleCodesByUserId(@Param("userId") Long userId);
}
