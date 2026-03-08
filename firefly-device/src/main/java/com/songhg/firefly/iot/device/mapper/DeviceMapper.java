package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.Device;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface DeviceMapper extends BaseMapper<Device> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM devices
            WHERE id = #{id}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    Device selectByIdIgnoreTenant(@Param("id") Long id);

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM devices
            WHERE product_id = #{productId}
              AND device_name = #{deviceName}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    Device selectByProductIdAndDeviceNameIgnoreTenant(@Param("productId") Long productId,
                                                      @Param("deviceName") String deviceName);
}
