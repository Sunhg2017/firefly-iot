package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.device.entity.DeviceVideoProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceVideoProfileMapper extends BaseMapper<DeviceVideoProfile> {

    @InterceptorIgnore(tenantLine = "true")
    DeviceVideoProfile selectByDeviceIdIgnoreTenant(@Param("deviceId") Long deviceId);

    @InterceptorIgnore(tenantLine = "true")
    DeviceVideoProfile selectByGbIdentityIgnoreTenant(@Param("gbDeviceId") String gbDeviceId,
                                                      @Param("gbDomain") String gbDomain);

    @InterceptorIgnore(tenantLine = "true")
    DeviceVideoProfile selectByProxyStreamIgnoreTenant(@Param("streamMode") StreamMode streamMode,
                                                       @Param("sourcePathSuffix") String sourcePathSuffix);
}
