package com.songhg.firefly.iot.system.job;

import com.songhg.firefly.iot.system.mapper.AuditLogMapper;
import com.songhg.firefly.iot.system.mapper.OperationLogMapper;
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
    private final OperationLogMapper operationLogMapper = mock(OperationLogMapper.class);
    private final AuditLogMapper auditLogMapper = mock(AuditLogMapper.class);

    private LogRetentionJob newJob() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        return new LogRetentionJob(redisTemplate, operationLogMapper, auditLogMapper, 90, 180);
    }

    @Test
    void skipsCleanupWhenLockIsHeldByAnotherInstance() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(false);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNull(result, "未抢到锁时应直接跳过，不执行清理");
        verifyNoInteractions(operationLogMapper, auditLogMapper);
        verify(valueOperations, never()).get(anyString());
    }

    @Test
    void cleansExpiredRowsInBatchesWhenLockAcquired() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        when(operationLogMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(1000, 200);
        when(auditLogMapper.deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE)).thenReturn(7);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals(1200, result.operationLogsDeleted(), "两批删除行数应累加");
        assertEquals(7, result.auditLogsDeleted());
        verify(operationLogMapper, times(2)).deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE);
        verify(auditLogMapper).deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void stopsAfterMaxBatchesWhenEveryBatchIsFull() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        when(operationLogMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE))
                .thenReturn(LogRetentionJob.BATCH_SIZE);
        when(auditLogMapper.deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals((long) LogRetentionJob.BATCH_SIZE * LogRetentionJob.MAX_BATCHES,
                result.operationLogsDeleted());
        verify(operationLogMapper, times(LogRetentionJob.MAX_BATCHES))
                .deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void keepsCleaningOtherTableWhenOneTableFails() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), eq(LogRetentionJob.LOCK_TTL)))
                .thenReturn(true);
        when(operationLogMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE))
                .thenThrow(new IllegalStateException("database unavailable"));
        when(auditLogMapper.deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE)).thenReturn(4);
        LogRetentionJob job = newJob();

        LogRetentionJob.CleanupResult result = job.runCleanup();

        assertNotNull(result);
        assertEquals(0, result.operationLogsDeleted(), "操作日志清理失败时返回已删除行数 0");
        assertEquals(4, result.auditLogsDeleted(), "审计日志清理不应被操作日志失败中断");
        verify(auditLogMapper).deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE);
    }

    @Test
    void scheduledMethodSwallowsRedisFailure() {
        when(redisTemplate.opsForValue()).thenThrow(new IllegalStateException("redis unavailable"));
        LogRetentionJob job = new LogRetentionJob(redisTemplate, operationLogMapper, auditLogMapper, 90, 180);

        assertDoesNotThrow(job::cleanupExpiredLogs);
        verifyNoInteractions(operationLogMapper, auditLogMapper);
    }

    @Test
    void doesNotDeleteLockOwnedByAnotherInstance() {
        when(valueOperations.setIfAbsent(eq(LogRetentionJob.LOCK_KEY), anyString(), any(Duration.class)))
                .thenReturn(true);
        when(valueOperations.get(LogRetentionJob.LOCK_KEY)).thenReturn("another-instance");
        when(operationLogMapper.deleteExpiredBatch(90, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        when(auditLogMapper.deleteExpiredBatch(180, LogRetentionJob.BATCH_SIZE)).thenReturn(0);
        LogRetentionJob job = newJob();

        job.runCleanup();

        verify(redisTemplate, never()).delete(LogRetentionJob.LOCK_KEY);
    }
}
