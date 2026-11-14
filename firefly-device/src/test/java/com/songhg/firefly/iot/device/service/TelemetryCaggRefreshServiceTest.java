package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.device.config.TelemetryGovernanceProperties;
import com.songhg.firefly.iot.device.entity.TelemetryCaggRefreshState;
import com.songhg.firefly.iot.device.mapper.TelemetryCaggRefreshMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CAGG 缺口补刷回归：首次回看、水位续刷、无缺口跳过、失败不推进水位、锁竞争跳过。
 */
class TelemetryCaggRefreshServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 15, 12, 0);

    private final TelemetryCaggRefreshMapper refreshMapper = mock(TelemetryCaggRefreshMapper.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final TelemetryGovernanceProperties properties = new TelemetryGovernanceProperties();
    private final TelemetryCaggRefreshService service =
            new TelemetryCaggRefreshService(refreshMapper, properties, redisTemplate) {
                @Override
                protected LocalDateTime now() {
                    return NOW;
                }
            };

    @BeforeEach
    void setUp() {
        properties.setCaggRefreshEnabled(true);
        properties.setCaggRefreshBatchHours(24);
        properties.setCaggRefreshMaxLookbackDays(3);
        properties.setCaggRefreshOverlapMinutes(10);
    }

    @Test
    void firstRunBackfillsLookbackInBatches() {
        when(refreshMapper.selectState(anyString())).thenReturn(null);

        service.refreshGap();

        // hourly: NOW-1h 为终点，回看 3 天 => 3 个 24h 批次
        verify(refreshMapper, times(3)).refreshContinuousAggregate(eq("device_telemetry_hourly"), any(), any());
        verify(refreshMapper, times(3)).upsertState(eq("device_telemetry_hourly"), any());
        // daily: NOW-1d 为终点，回看 3 天 => 3 个批次
        verify(refreshMapper, times(3)).refreshContinuousAggregate(eq("device_telemetry_daily"), any(), any());
    }

    @Test
    void watermarkResumesWithOverlap() {
        TelemetryCaggRefreshState hourlyState = new TelemetryCaggRefreshState();
        hourlyState.setCaggName("device_telemetry_hourly");
        hourlyState.setRefreshedUntil(NOW.minusDays(2));
        when(refreshMapper.selectState("device_telemetry_hourly")).thenReturn(hourlyState);
        when(refreshMapper.selectState("device_telemetry_daily")).thenReturn(null);

        service.refreshGap();

        ArgumentCaptor<LocalDateTime> startCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(refreshMapper, atLeastOnce())
                .refreshContinuousAggregate(eq("device_telemetry_hourly"), startCaptor.capture(), any());
        assertEquals(NOW.minusDays(2).minusMinutes(10), startCaptor.getAllValues().get(0));
    }

    @Test
    void noGapSkipsRefresh() {
        TelemetryCaggRefreshState hourlyState = new TelemetryCaggRefreshState();
        hourlyState.setRefreshedUntil(NOW.minusMinutes(40));
        TelemetryCaggRefreshState dailyState = new TelemetryCaggRefreshState();
        // 水位晚于 daily 终点（NOW-1d）加重叠窗口，表示没有缺口
        dailyState.setRefreshedUntil(NOW.minusHours(12));
        when(refreshMapper.selectState("device_telemetry_hourly")).thenReturn(hourlyState);
        when(refreshMapper.selectState("device_telemetry_daily")).thenReturn(dailyState);

        service.refreshGap();

        verify(refreshMapper, never()).refreshContinuousAggregate(anyString(), any(), any());
        verify(refreshMapper, never()).upsertState(anyString(), any());
    }

    @Test
    void failureDoesNotAdvanceWatermarkForFailedCagg() {
        when(refreshMapper.selectState(anyString())).thenReturn(null);
        doThrow(new RuntimeException("timescaledb unavailable"))
                .when(refreshMapper).refreshContinuousAggregate(eq("device_telemetry_hourly"), any(), any());

        service.refreshGap();

        verify(refreshMapper, never()).upsertState(eq("device_telemetry_hourly"), any());
        // 另一个聚合不受影响
        verify(refreshMapper, times(3)).refreshContinuousAggregate(eq("device_telemetry_daily"), any(), any());
    }

    @Test
    void lockHeldSkipsWork() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);

        service.refreshGapWithLock();

        verify(refreshMapper, never()).selectState(anyString());
    }
}
