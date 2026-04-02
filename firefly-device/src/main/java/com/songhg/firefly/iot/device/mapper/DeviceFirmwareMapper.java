package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareListQueryDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareListVO;
import com.songhg.firefly.iot.device.entity.DeviceFirmware;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceFirmwareMapper extends BaseMapper<DeviceFirmware> {

    @InterceptorIgnore(tenantLine = "true")
    IPage<DeviceFirmwareListVO> selectBindingPage(Page<DeviceFirmwareListVO> page,
                                                  @Param("tenantId") Long tenantId,
                                                  @Param("query") DeviceFirmwareListQueryDTO query);
}
