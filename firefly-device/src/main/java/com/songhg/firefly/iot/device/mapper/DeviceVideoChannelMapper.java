package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DeviceVideoChannel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DeviceVideoChannelMapper extends BaseMapper<DeviceVideoChannel> {

    @InterceptorIgnore(tenantLine = "true")
    List<DeviceVideoChannel> selectByDeviceIdIgnoreTenant(@Param("deviceId") Long deviceId);
}
