package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryDownsampleVO;
import com.songhg.firefly.iot.device.entity.TenantTelemetryRetention;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 时序数据治理 Mapper：按租户保留策略与跨租户过期清理、降采样查询。
 * 清理与策略读取需要跨租户执行，统一忽略租户行级隔离并在 SQL 中显式处理 tenant_id。
 */
@Mapper
public interface TelemetryRetentionMapper {

    @InterceptorIgnore(tenantLine = "true")
    TenantTelemetryRetention selectByTenantId(@Param("tenantId") Long tenantId);

    @InterceptorIgnore(tenantLine = "true")
    int upsert(TenantTelemetryRetention retention);

    @InterceptorIgnore(tenantLine = "true")
    int deleteByTenantId(@Param("tenantId") Long tenantId);

    @InterceptorIgnore(tenantLine = "true")
    int deleteExpiredForTenantsWithOverride();

    @InterceptorIgnore(tenantLine = "true")
    int deleteExpiredForDefaultTenants(@Param("defaultDays") int defaultDays);

    @InterceptorIgnore(tenantLine = "true")
    List<TelemetryDownsampleVO> queryHourlyAggregate(@Param("tenantId") Long tenantId,
                                                     @Param("deviceId") Long deviceId,
                                                     @Param("property") String property,
                                                     @Param("startTime") String startTime,
                                                     @Param("endTime") String endTime);

    @InterceptorIgnore(tenantLine = "true")
    List<TelemetryDownsampleVO> queryDailyAggregate(@Param("tenantId") Long tenantId,
                                                    @Param("deviceId") Long deviceId,
                                                    @Param("property") String property,
                                                    @Param("startTime") String startTime,
                                                    @Param("endTime") String endTime);
}
