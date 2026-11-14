package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.api.dto.SharedDeviceEventDTO;
import com.songhg.firefly.iot.device.entity.DeviceEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface DeviceEventMapper extends BaseMapper<DeviceEvent> {

    /**
     * 定时保留清理：删除创建时间早于保留天数的设备事件，单批最多 {@code batchSize} 行。
     *
     * <p>调度线程没有租户上下文，且事件保留是全局运维口径，因此忽略租户行级隔离，
     * 由 Job 侧循环分批调用以避免长事务。SQL 见 {@code DeviceEventMapper.xml}。</p>
     *
     * @param retentionDays 保留天数（大于 0）
     * @param batchSize     单批删除上限
     * @return 本批实际删除行数
     */
    @InterceptorIgnore(tenantLine = "true")
    int deleteExpiredBatch(@Param("retentionDays") int retentionDays, @Param("batchSize") int batchSize);

    /**
     * 跨租户共享事件查询：调用方已通过共享策略校验所有方租户，因此跳过租户行级隔离。
     * SQL 见 {@code DeviceEventMapper.xml}。
     */
    @InterceptorIgnore(tenantLine = "true")
    List<SharedDeviceEventDTO> selectSharedEvents(@Param("ownerTenantId") Long ownerTenantId,
                                                  @Param("deviceId") Long deviceId,
                                                  @Param("startTime") LocalDateTime startTime,
                                                  @Param("endTime") LocalDateTime endTime,
                                                  @Param("limit") int limit);
}
