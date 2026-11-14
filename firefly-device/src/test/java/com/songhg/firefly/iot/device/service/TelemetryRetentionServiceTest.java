package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.device.config.TelemetryGovernanceProperties;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryRetentionVO;
import com.songhg.firefly.iot.device.entity.TenantTelemetryRetention;
import com.songhg.firefly.iot.device.mapper.TelemetryRetentionMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TelemetryRetentionServiceTest {

    private final TelemetryRetentionMapper retentionMapper = mock(TelemetryRetentionMapper.class);
    private final TelemetryGovernanceProperties properties = new TelemetryGovernanceProperties();
    private TelemetryRetentionService service;

    @BeforeEach
    void setUp() {
        properties.setDefaultRetentionDays(90);
        properties.setGlobalMaxRetentionDays(365);
        service = new TelemetryRetentionService(retentionMapper, properties);
        AppContextHolder.setTenantId(1L);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void returnsDefaultWhenNoTenantOverride() {
        when(retentionMapper.selectByTenantId(1L)).thenReturn(null);

        TelemetryRetentionVO vo = service.getRetention();

        assertEquals(90, vo.getRetentionDays());
        assertEquals(90, vo.getDefaultRetentionDays());
        assertEquals(365, vo.getGlobalMaxRetentionDays());
        assertTrue(vo.getUsingDefault());
    }

    @Test
    void returnsTenantOverrideWhenConfigured() {
        TenantTelemetryRetention retention = new TenantTelemetryRetention();
        retention.setTenantId(1L);
        retention.setRetentionDays(30);
        when(retentionMapper.selectByTenantId(1L)).thenReturn(retention);

        TelemetryRetentionVO vo = service.getRetention();

        assertEquals(30, vo.getRetentionDays());
        assertFalse(vo.getUsingDefault());
    }

    @Test
    void setRetentionUpsertsForCurrentTenant() {
        TenantTelemetryRetention saved = new TenantTelemetryRetention();
        saved.setTenantId(1L);
        saved.setRetentionDays(30);
        when(retentionMapper.selectByTenantId(1L)).thenReturn(saved);

        service.setRetention(30);

        verify(retentionMapper).upsert(any(TenantTelemetryRetention.class));
    }

    @Test
    void rejectsRetentionBelowOneDay() {
        assertThrows(BizException.class, () -> service.setRetention(0));
        verify(retentionMapper, never()).upsert(any());
    }

    @Test
    void rejectsRetentionAboveGlobalMax() {
        assertThrows(BizException.class, () -> service.setRetention(366));
        verify(retentionMapper, never()).upsert(any());
    }

    @Test
    void resetDeletesTenantOverride() {
        service.resetRetention();

        verify(retentionMapper).deleteByTenantId(eq(1L));
    }
}
