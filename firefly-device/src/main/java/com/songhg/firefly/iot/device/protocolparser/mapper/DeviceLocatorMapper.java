package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.DeviceLocator;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceLocatorMapper extends BaseMapper<DeviceLocator> {

    @InterceptorIgnore(tenantLine = "true")
    DeviceLocator selectByProductIdAndLocatorIgnoreTenant(@Param("productId") Long productId,
                                                          @Param("locatorType") String locatorType,
                                                          @Param("locatorValue") String locatorValue);
}
