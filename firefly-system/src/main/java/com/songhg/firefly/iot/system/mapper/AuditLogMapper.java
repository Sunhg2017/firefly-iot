package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.AuditLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditLogMapper extends BaseMapper<AuditLog> {

    /**
     * 定时保留清理：删除创建时间早于保留天数的审计日志，单批最多 {@code batchSize} 行。
     *
     * <p>审计日志必须跨租户清理，因此忽略租户行级隔离；由 Job 侧循环分批调用以避免长事务。
     * SQL 见 {@code AuditLogMapper.xml}。</p>
     *
     * @param retentionDays 保留天数（大于 0）
     * @param batchSize     单批删除上限
     * @return 本批实际删除行数
     */
    @InterceptorIgnore(tenantLine = "true")
    int deleteExpiredBatch(@Param("retentionDays") int retentionDays, @Param("batchSize") int batchSize);
}
