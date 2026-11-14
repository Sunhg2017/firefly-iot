package com.songhg.firefly.iot.device.config;

import com.songhg.firefly.iot.common.metrics.Metrics;
import com.songhg.firefly.iot.device.dto.device.TenantOnlineCount;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 设备在线指标：同时提供全租户口径与按租户拆分口径。
 *
 * <ul>
 *   <li>{@code firefly.device.online}：全租户在线数，Prometheus 每次抓取时实时查库；</li>
 *   <li>{@code firefly.device.online.by.tenant{tenant=...}}：按租户拆分，按刷新间隔查库后更新内存快照；
 *       租户标签优先取 {@code tenants.code}，缺失时回退为租户 ID 字符串。</li>
 * </ul>
 *
 * <p>按租户指标使用「每个租户一个 Gauge + 共享快照 Map」实现，避免 MultiGauge 重复追加行；
 * 租户首次出现在在线列表时注册 Gauge，之后即使掉线为 0 也保留并读取快照中的 0。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceMetricsBinder {

    private static final String GLOBAL_ONLINE_METRIC = "firefly.device.online";
    private static final String TENANT_ONLINE_METRIC = "firefly.device.online.by.tenant";

    private final DeviceMapper deviceMapper;
    private final ObjectProvider<MeterRegistry> meterRegistryProvider;

    /**
     * 租户维度在线数快照，Gauge 读取该 Map。
     */
    private final Map<Long, Long> onlineByTenant = new ConcurrentHashMap<>();

    /**
     * 已注册过 Gauge 的租户，防止重复注册。
     */
    private final Set<Long> registeredTenantIds = ConcurrentHashMap.newKeySet();

    @EventListener(ApplicationReadyEvent.class)
    public void registerGauges() {
        Metrics.gaugeOnce(GLOBAL_ONLINE_METRIC, this::safeGlobalOnlineCount);
        refreshTenantOnline();
    }

    /**
     * 定时刷新按租户在线数；首次启动也会通过 {@link #registerGauges()} 触发一次。
     */
    @Scheduled(fixedDelayString = "${firefly.metrics.device-online-refresh-interval-ms:30000}")
    public void refreshTenantOnline() {
        MeterRegistry registry = meterRegistryProvider.getIfAvailable();
        if (registry == null) {
            return;
        }
        List<TenantOnlineCount> rows;
        try {
            rows = deviceMapper.selectOnlineCountByTenantIgnoreTenant();
        } catch (Exception ex) {
            log.warn("Failed to refresh tenant online metrics: {}", ex.getMessage());
            return;
        }

        Map<Long, Long> snapshot = new HashMap<>();
        for (TenantOnlineCount row : rows) {
            if (row.getTenantId() == null) {
                continue;
            }
            snapshot.put(row.getTenantId(), row.getOnlineCount() == null ? 0L : row.getOnlineCount());
            registerTenantGaugeIfAbsent(registry, row);
        }
        onlineByTenant.clear();
        onlineByTenant.putAll(snapshot);
    }

    private void registerTenantGaugeIfAbsent(MeterRegistry registry, TenantOnlineCount row) {
        Long tenantId = row.getTenantId();
        if (!registeredTenantIds.add(tenantId)) {
            return;
        }
        String tenantLabel = StringUtils.hasText(row.getTenantCode())
                ? row.getTenantCode()
                : String.valueOf(tenantId);
        Gauge.builder(TENANT_ONLINE_METRIC, onlineByTenant,
                        map -> map.getOrDefault(tenantId, 0L).doubleValue())
                .description("Online device count by tenant")
                .tags("tenant", tenantLabel)
                .register(registry);
    }

    private long safeGlobalOnlineCount() {
        try {
            Long count = deviceMapper.countOnlineIgnoreTenant();
            return count == null ? 0L : count;
        } catch (Exception ex) {
            return 0L;
        }
    }
}
