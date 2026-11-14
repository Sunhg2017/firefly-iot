package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.songhg.firefly.iot.device.entity.TelemetryCaggRefreshState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

/**
 * 连续聚合缺口补刷 Mapper：跨租户执行，无租户上下文。
 */
@Mapper
public interface TelemetryCaggRefreshMapper {

    @InterceptorIgnore(tenantLine = "true")
    TelemetryCaggRefreshState selectState(@Param("caggName") String caggName);

    @InterceptorIgnore(tenantLine = "true")
    int upsertState(@Param("caggName") String caggName,
                    @Param("refreshedUntil") LocalDateTime refreshedUntil);

    /**
     * 调用 TimescaleDB 过程回填指定区间；区间由调用方按批切分，避免单次刷新过大。
     */
    @InterceptorIgnore(tenantLine = "true")
    void refreshContinuousAggregate(@Param("caggName") String caggName,
                                    @Param("windowStart") LocalDateTime windowStart,
                                    @Param("windowEnd") LocalDateTime windowEnd);
}
