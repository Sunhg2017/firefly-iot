package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DeviceShadowRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceShadowMapper extends BaseMapper<DeviceShadowRecord> {

    /**
     * 原子合并 desired 增量并返回合并后的权威行；JSONB 合并与版本自增在数据库内完成。
     */
    @InterceptorIgnore(tenantLine = "true")
    DeviceShadowRecord mergeDesired(@Param("deviceId") Long deviceId,
                                    @Param("tenantId") Long tenantId,
                                    @Param("delta") String delta);

    /**
     * 原子替换 desired 并返回权威行，用于清空或回执收敛。
     */
    @InterceptorIgnore(tenantLine = "true")
    DeviceShadowRecord replaceDesired(@Param("deviceId") Long deviceId,
                                      @Param("tenantId") Long tenantId,
                                      @Param("desired") String desired);

    @InterceptorIgnore(tenantLine = "true")
    DeviceShadowRecord selectByDeviceIdIgnoreTenant(@Param("deviceId") Long deviceId);

    @InterceptorIgnore(tenantLine = "true")
    int deleteByDeviceIdIgnoreTenant(@Param("deviceId") Long deviceId);
}
