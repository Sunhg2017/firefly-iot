package com.songhg.firefly.iot.common.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * 把 Spring 管理的 {@link MeterRegistry} 绑定到 {@link Metrics} 静态门面。
 * 使用 ObjectProvider 容忍未启用 actuator 的场景。
 */
@Slf4j
@Component
public class MetricsBinder {

    public MetricsBinder(ObjectProvider<MeterRegistry> registryProvider) {
        MeterRegistry registry = registryProvider.getIfAvailable();
        if (registry == null) {
            log.debug("No MeterRegistry available, business metrics will be no-op");
            return;
        }
        Metrics.bind(registry);
        log.info("Business metrics bound to MeterRegistry: {}", registry.getClass().getSimpleName());
    }
}
