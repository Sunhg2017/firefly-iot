package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryAggregateVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryDataVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryLatestVO;
import com.songhg.firefly.iot.device.entity.DeviceTelemetry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DeviceTelemetryMapper {

    void batchInsert(@Param("list") List<DeviceTelemetry> list);

    List<TelemetryDataVO> queryTelemetry(@Param("tenantId") Long tenantId,
                                          @Param("deviceId") Long deviceId,
                                          @Param("property") String property,
                                          @Param("startTime") String startTime,
                                          @Param("endTime") String endTime,
                                          @Param("limit") Integer limit);

    List<TelemetryAggregateVO> aggregateTelemetry(@Param("tenantId") Long tenantId,
                                                   @Param("deviceId") Long deviceId,
                                                   @Param("property") String property,
                                                   @Param("startTime") String startTime,
                                                   @Param("endTime") String endTime,
                                                   @Param("interval") String interval);

    List<TelemetryLatestVO> queryLatest(@Param("tenantId") Long tenantId,
                                         @Param("deviceId") Long deviceId);

    @InterceptorIgnore(tenantLine = "true")
    List<DeviceTelemetryPointDTO> queryTelemetryIgnoreTenant(@Param("tenantId") Long tenantId,
                                                             @Param("deviceId") Long deviceId,
                                                             @Param("property") String property,
                                                             @Param("startTime") String startTime,
                                                             @Param("endTime") String endTime,
                                                             @Param("limit") Integer limit);

    @InterceptorIgnore(tenantLine = "true")
    List<DeviceTelemetrySnapshotDTO> queryLatestIgnoreTenant(@Param("tenantId") Long tenantId,
                                                             @Param("deviceId") Long deviceId);
}
