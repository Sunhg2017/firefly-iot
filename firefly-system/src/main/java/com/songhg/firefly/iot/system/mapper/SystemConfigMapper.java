package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.SystemConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SystemConfigMapper extends BaseMapper<SystemConfig> {

    @InterceptorIgnore(tenantLine = "true")
    SystemConfig selectByTenantIdAndConfigKey(@Param("tenantId") Long tenantId,
                                              @Param("configKey") String configKey);
}
