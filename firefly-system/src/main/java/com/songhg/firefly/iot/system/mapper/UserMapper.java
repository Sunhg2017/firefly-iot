package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    @InterceptorIgnore(tenantLine = "true")
    java.util.List<User> findByIdentifierGlobal(@Param("identifier") String identifier);
}
