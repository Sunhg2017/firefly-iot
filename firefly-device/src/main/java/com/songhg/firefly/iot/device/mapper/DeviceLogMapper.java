package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceLogMapper extends BaseMapper<DeviceLog> {
}
