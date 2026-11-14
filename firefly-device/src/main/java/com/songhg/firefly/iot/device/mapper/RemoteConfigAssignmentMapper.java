package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.RemoteConfigAssignment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RemoteConfigAssignmentMapper extends BaseMapper<RemoteConfigAssignment> {

    /**
     * 设备回执 PROPERTY_SET_REPLY 后，将最近一条已投递的下发记录标记为已确认。
     */
    @InterceptorIgnore(tenantLine = "true")
    int markLatestAcked(@Param("tenantId") Long tenantId, @Param("deviceId") Long deviceId);
}
