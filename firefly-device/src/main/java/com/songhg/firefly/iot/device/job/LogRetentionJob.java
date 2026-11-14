package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.mapper.DeviceEventMapper;
import com.songhg.firefly.iot.device.mapper.DeviceLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;
import java.util.function.IntBinaryOperator;

/**
 * 设备日志与设备事件保留清理任务。
 *
 * <p>清理范围是全局表（{@code device_logs} / {@code device_events}），不是当前租户：调度线程没有
 * 租户上下文，且保留天数是全局运维配置；对应 Mapper 方法通过
 * {@code @InterceptorIgnore(tenantLine = "true")} 跳过租户行级隔离，避免拦截器在无租户上下文时
 * 注入条件或直接抛错。</p>
 *
 * <p>多副本部署时使用 Redis 分布式锁（{@value #LOCK_KEY}）保证同一时刻只有一个实例执行；
 * 抢不到锁直接跳过本次调度。锁 TTL 为 10 分钟，即使实例异常退出、
 * 未主动释放锁也会自动过期。</p>
 *
 * <p>单批删除 {@value #BATCH_SIZE} 行、单次最多 {@value #MAX_BATCHES} 批，避免一次清理产生长事务；
 * 若达到批次上限仍有剩余数据，下一次调度会继续清理。</p>
 */
@Slf4j
@Component
public class LogRetentionJob {

    /** 设备模块日志清理的分布式锁 key，与 system 模块的锁相互独立。 */
    static final String LOCK_KEY = "lock:job:log-retention:device";
    /** 锁 TTL：需大于单次清理最长耗时；异常退出时也能自动过期，避免永久死锁。 */
    static final Duration LOCK_TTL = Duration.ofMinutes(10);
    /** 单批删除行数：控制单条 DELETE 的锁范围与执行时长。 */
    static final int BATCH_SIZE = 1000;
    /** 单次运行最多批次数：防止单次清理耗时不可控，剩余数据留待下一次调度。 */
    static final int MAX_BATCHES = 100;

    private final StringRedisTemplate redisTemplate;
    private final DeviceLogMapper deviceLogMapper;
    private final DeviceEventMapper deviceEventMapper;
    private final int deviceLogRetentionDays;
    private final int deviceEventRetentionDays;
    /** 锁持有者标识：释放锁前比对，避免误删其他实例重新获取的锁。 */
    private final String lockValue;

    public LogRetentionJob(StringRedisTemplate redisTemplate,
                           DeviceLogMapper deviceLogMapper,
                           DeviceEventMapper deviceEventMapper,
                           @Value("${firefly.logs.device-log-retention-days:30}") int deviceLogRetentionDays,
                           @Value("${firefly.logs.device-event-retention-days:90}") int deviceEventRetentionDays) {
        this.redisTemplate = redisTemplate;
        this.deviceLogMapper = deviceLogMapper;
        this.deviceEventMapper = deviceEventMapper;
        // 保留天数至少 1 天，避免误配 0/负数导致全表被清理
        this.deviceLogRetentionDays = Math.max(1, deviceLogRetentionDays);
        this.deviceEventRetentionDays = Math.max(1, deviceEventRetentionDays);
        this.lockValue = UUID.randomUUID().toString();
    }

    /**
     * 调度入口：执行时间由 {@code firefly.logs.retention-cleanup-cron} 控制，默认每日 03:20。
     * 任何异常都在本方法内记录日志，不能抛给调度线程，否则会中断后续调度。
     */
    @Scheduled(cron = "${firefly.logs.retention-cleanup-cron:0 20 3 * * ?}")
    public void cleanupExpiredLogs() {
        try {
            CleanupResult result = runCleanup();
            if (result == null) {
                // 未抢到锁属于正常多副本竞争，runCleanup 已记录跳过日志
                return;
            }
            log.info("Log retention cleanup finished: deviceLogsDeleted={}, deviceEventsDeleted={}, "
                            + "deviceLogRetentionDays={}, deviceEventRetentionDays={}",
                    result.deviceLogsDeleted(), result.deviceEventsDeleted(),
                    deviceLogRetentionDays, deviceEventRetentionDays);
        } catch (Exception ex) {
            log.error("Log retention cleanup job failed: {}", ex.getMessage(), ex);
        }
    }

    /**
     * 抢锁后按表执行清理，返回各表删除行数；未抢到锁返回 {@code null}。
     * 包级可见，便于单元测试直接驱动，不依赖 Spring 调度容器。
     */
    CleanupResult runCleanup() {
        if (!tryAcquireLock()) {
            log.info("Skip log retention cleanup because lock is held by another instance: key={}", LOCK_KEY);
            return null;
        }
        try {
            int deviceLogsDeleted = cleanupTable("device_logs", deviceLogRetentionDays,
                    deviceLogMapper::deleteExpiredBatch);
            int deviceEventsDeleted = cleanupTable("device_events", deviceEventRetentionDays,
                    deviceEventMapper::deleteExpiredBatch);
            return new CleanupResult(deviceLogsDeleted, deviceEventsDeleted);
        } finally {
            releaseLock();
        }
    }

    private boolean tryAcquireLock() {
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, lockValue, LOCK_TTL);
        return Boolean.TRUE.equals(acquired);
    }

    private void releaseLock() {
        try {
            // 先比对持有者再删除。比对与删除不是原子操作，存在极端竞态：锁恰好过期并被其他实例
            // 重新获取时可能误删一次，但下一次调度仍可正常加锁，且 LOCK_TTL 兜底不会永久死锁。
            if (lockValue.equals(redisTemplate.opsForValue().get(LOCK_KEY))) {
                redisTemplate.delete(LOCK_KEY);
            }
        } catch (Exception ex) {
            log.warn("Failed to release log retention lock: key={}, error={}", LOCK_KEY, ex.getMessage());
        }
    }

    /**
     * 按固定批次循环删除单张表的过期数据。
     * 单表失败不影响另一张表清理：记录错误并返回已删除行数，由调度入口统一记录汇总结果。
     */
    private int cleanupTable(String table, int retentionDays, IntBinaryOperator deleteBatch) {
        int deletedTotal = 0;
        try {
            for (int batch = 0; batch < MAX_BATCHES; batch++) {
                int deleted = deleteBatch.applyAsInt(retentionDays, BATCH_SIZE);
                deletedTotal += deleted;
                if (deleted < BATCH_SIZE) {
                    break;
                }
                if (batch == MAX_BATCHES - 1) {
                    log.warn("Log retention cleanup reached max batches, remaining rows will be cleaned next run: "
                                    + "table={}, retentionDays={}, deleted={}, maxBatches={}",
                            table, retentionDays, deletedTotal, MAX_BATCHES);
                }
            }
            log.info("Cleaned expired records: table={}, retentionDays={}, deleted={}",
                    table, retentionDays, deletedTotal);
            return deletedTotal;
        } catch (Exception ex) {
            log.error("Failed to clean expired records: table={}, retentionDays={}, deletedBeforeFailure={}, error={}",
                    table, retentionDays, deletedTotal, ex.getMessage(), ex);
            return deletedTotal;
        }
    }

    /**
     * 单次清理结果，用于日志汇总与单元测试断言。
     */
    record CleanupResult(int deviceLogsDeleted, int deviceEventsDeleted) {
    }
}
