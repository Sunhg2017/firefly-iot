package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.mapper.DeviceEventMapper;
import com.songhg.firefly.iot.device.mapper.DeviceLogMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link LogRetentionJob} 单元测试：不启动 Spring 容器、不依赖真实 Redis/数据库。
 */
class LogRetentionJobTest {

    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final DeviceLogMapper deviceLogMapper = mock(DeviceLogMapper.class);
    private final DeviceEventMapper deviceEventMapper = mock(DeviceEventMapper.class);

    private LogRetentionJob newJob() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        return new LogRetentionJob(redisTemplate, deviceLogMapper, deviceEventMapper, 30, 90);
    }

    @Test
    void skipsCleanupWhenLockIsHeldByAnotherInstance() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(false);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNull(result, "未抢到锁时应直接跳过，不执行清理");
        verifyNoInteractions(deviceLogMapper, deviceEventMapper);
        // 未抢到锁不应尝试释放别人的锁
        verify(valueOperations, never()).get(anyString());
    }

    @Test
    void cleansExpiredRowsInBatchesWhenLockAcquired() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        // 设备日志第一批返回满批，第二批不足一批即停止；设备事件一次删除完成
        when(deviceLogMapper.deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE)).thenReturn(1000, 200);
        when(deviceEventMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(5);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals(1200, result.deviceLogsDeleted(), "两批删除行数应累加");
        assertEquals(5, result.deviceEventsDeleted());
        verify(deviceLogMapper, times(2)).deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE);
        verify(deviceEventMapper).deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void stopsAfterMaxBatchesWhenEveryBatchIsFull() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        when(deviceLogMapper.deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE))
                .thenReturn(LogRetentionJob.BATCH_SIZE);
        when(deviceEventMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals((long) LogRetentionJob.BATCH_SIZE * LogRetentionJob.MAX_BATCHES, result.deviceLogsDeleted());
        verify(deviceLogMapper, times(LogRetentionJob.MAX_BATCHES))
                .deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void keepsCleaningOtherTableWhenOneTableFails() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        when(deviceLogMapper.deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE))
                .thenThrow(new IllegalStateException("database unavailable"));
        when(deviceEventMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(3);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals(0, result.deviceLogsDeleted(), "设备日志清理失败时返回已删除行数 0");
        assertEquals(3, result.deviceEventsDeleted(), "设备事件清理不应被设备日志失败中断");
        verify(deviceEventMapper).deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void scheduledMethodSwallowsRedisFailure() {
        when(redisTemplate.opsForValue()).thenThrow(new IllegalStateException("redis unavailable"));
        LogRetentionJob job = new LogRetentionJob(redisTemplate, deviceLogMapper, deviceEventMapper, 30, 90);

        // 调度线程必须有异常兜底：Redis 不可用时只记录日志，不向调度器抛异常
        assertDoesNotThrow(job::cleanupExpiredLogs);
        verifyNoInteractions(deviceLogMapper, deviceEventMapper);
    }

    @Test
    void doesNotDeleteLockOwnedByAnotherInstance() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), any(Duration.class)))
                .thenReturn(true);
        when(valueOperations.get(LogRetentionJob.LOCK_KEY)).thenReturn(null);
        when(deviceLogMapper.deleteExpiredBatch(30, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        when(deviceEventMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        LogRetentionJob job = newJob();

        job.runCleanup();

        // 锁值未匹配（此处模拟已被其他实例接管）时不能删除锁；验证释放前有兜底判断
        verify(redisTemplate, never()).delete(LogRetentionJob.LOCK_KEY);
    }
}
