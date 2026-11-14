package com.songhg.firefly.iot.device.config;

import com.songhg.firefly.iot.common.metrics.Metrics;
import com.songhg.firefly.iot.device.dto.device.TenantOnlineCount;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DeviceMetricsBinderTest {

    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final ObjectProvider<MeterRegistry> provider = mockProvider(registry);

    @Test
    void exposesGlobalAndPerTenantOnlineGauges() {
        Metrics.bind(registry);
        when(deviceMapper.countOnlineIgnoreTenant()).thenReturn(5L);
        when(deviceMapper.selectOnlineCountByTenantIgnoreTenant()).thenReturn(List.of(
                row(1L, "tenant-a", 3L),
                row(2L, "tenant-b", 2L)));

        DeviceMetricsBinder binder = new DeviceMetricsBinder(deviceMapper, provider);
        binder.registerGauges();

        assertEquals(5.0, registry.get("firefly.device.online").gauge().value());
        assertEquals(3.0, registry.get("firefly.device.online.by.tenant").tag("tenant", "tenant-a").gauge().value());
        assertEquals(2.0, registry.get("firefly.device.online.by.tenant").tag("tenant", "tenant-b").gauge().value());
    }

    @Test
    void refreshUpdatesTenantValuesAndDropsToZero() {
        when(deviceMapper.selectOnlineCountByTenantIgnoreTenant())
                .thenReturn(List.of(row(1L, "tenant-a", 4L)));
        DeviceMetricsBinder binder = new DeviceMetricsBinder(deviceMapper, provider);
        binder.refreshTenantOnline();
        assertEquals(4.0, registry.get("firefly.device.online.by.tenant").tag("tenant", "tenant-a").gauge().value());

        when(deviceMapper.selectOnlineCountByTenantIgnoreTenant()).thenReturn(List.of());
        binder.refreshTenantOnline();
        assertEquals(0.0, registry.get("firefly.device.online.by.tenant").tag("tenant", "tenant-a").gauge().value());
    }

    @Test
    void fallsBackToTenantIdWhenCodeMissing() {
        when(deviceMapper.selectOnlineCountByTenantIgnoreTenant())
                .thenReturn(List.of(row(7L, null, 1L)));
        DeviceMetricsBinder binder = new DeviceMetricsBinder(deviceMapper, provider);
        binder.refreshTenantOnline();
        assertEquals(1.0, registry.get("firefly.device.online.by.tenant").tag("tenant", "7").gauge().value());
    }

    private TenantOnlineCount row(Long tenantId, String tenantCode, Long onlineCount) {
        TenantOnlineCount row = new TenantOnlineCount();
        row.setTenantId(tenantId);
        row.setTenantCode(tenantCode);
        row.setOnlineCount(onlineCount);
        return row;
    }

    @SuppressWarnings("unchecked")
    private ObjectProvider<MeterRegistry> mockProvider(MeterRegistry meterRegistry) {
        ObjectProvider<MeterRegistry> objectProvider = mock(ObjectProvider.class);
        when(objectProvider.getIfAvailable()).thenReturn(meterRegistry);
        return objectProvider;
    }
}
