package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceLogMapper extends BaseMapper<DeviceLog> {

    /**
     * 定时保留清理：删除创建时间早于保留天数的设备日志，单批最多 {@code batchSize} 行。
     *
     * <p>调度线程没有租户上下文，且日志保留是全局运维口径，因此忽略租户行级隔离，
     * 由 Job 侧循环分批调用以避免长事务。SQL 见 {@code DeviceLogMapper.xml}。</p>
     *
     * @param retentionDays 保留天数（大于 0）
     * @param batchSize     单批删除上限
     * @return 本批实际删除行数
     */
    @InterceptorIgnore(tenantLine = "true")
    int deleteExpiredBatch(@Param("retentionDays") int retentionDays, @Param("batchSize") int batchSize);
}
