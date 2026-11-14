package com.songhg.firefly.iot.common.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * 业务指标静态门面：让没有注入 {@link MeterRegistry} 的既有服务/工具类也能零侵入地打点。
 *
 * <p>未绑定注册表（例如单元测试或未启用 actuator 的场景）时所有方法自动降级为空操作，
 * 不会改变原有调用链行为。指标命名统一以 {@code firefly.} 前缀开头，便于 Prometheus 抓取与看板聚合。</p>
 */
public final class Metrics {

    private static volatile MeterRegistry registry;
    private static final Set<String> REGISTERED_GAUGES = ConcurrentHashMap.newKeySet();

    private Metrics() {
    }

    /**
     * 由 {@link MetricsBinder} 在应用启动时绑定，重复调用安全。
     */
    public static void bind(MeterRegistry meterRegistry) {
        if (meterRegistry != null) {
            registry = meterRegistry;
        }
    }

    public static void increment(String name, String... tagKeyValues) {
        MeterRegistry current = registry;
        if (current == null) {
            return;
        }
        Counter.builder(name).tags(Tags.of(tagKeyValues)).register(current).increment();
    }

    public static void increment(String name, long amount, String... tagKeyValues) {
        MeterRegistry current = registry;
        if (current == null) {
            return;
        }
        Counter.builder(name).tags(Tags.of(tagKeyValues)).register(current).increment(amount);
    }

    /**
     * 注册只读 Gauge（幂等），用于在线设备数等需要实时读取的值。
     */
    public static void gaugeOnce(String name, Supplier<Number> supplier, String... tagKeyValues) {
        MeterRegistry current = registry;
        if (current == null || !REGISTERED_GAUGES.add(name + Arrays.toString(tagKeyValues))) {
            return;
        }
        Gauge.builder(name, supplier)
                .tags(Tags.of(tagKeyValues))
                .register(current);
    }
}
