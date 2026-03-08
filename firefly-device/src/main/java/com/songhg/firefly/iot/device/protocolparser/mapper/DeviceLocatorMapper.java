package com.songhg.firefly.iot.device.protocolparser.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.DeviceLocator;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface DeviceLocatorMapper extends BaseMapper<DeviceLocator> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM device_locators
            WHERE product_id = #{productId}
              AND locator_type = #{locatorType}
              AND locator_value = #{locatorValue}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    DeviceLocator selectByProductIdAndLocatorIgnoreTenant(@Param("productId") Long productId,
                                                          @Param("locatorType") String locatorType,
                                                          @Param("locatorValue") String locatorValue);
}
