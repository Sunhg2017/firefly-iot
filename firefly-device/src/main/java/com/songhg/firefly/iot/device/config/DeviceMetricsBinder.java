package com.songhg.firefly.iot.device.config;

import com.songhg.firefly.iot.common.metrics.Metrics;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 设备域业务指标：在线设备数以 Gauge 形式暴露，Prometheus 每次抓取时实时查库。
 */
@Component
@RequiredArgsConstructor
public class DeviceMetricsBinder {

    private final DeviceMapper deviceMapper;

    @EventListener(ApplicationReadyEvent.class)
    public void registerGauges() {
        Metrics.gaugeOnce("firefly.device.online", () -> {
            try {
                Long count = deviceMapper.countOnlineIgnoreTenant();
                return count == null ? 0L : count;
            } catch (Exception ex) {
                return 0L;
            }
        });
    }
}
