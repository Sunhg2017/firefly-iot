package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.TraceContext;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

import java.util.Map;

/**
 * 异步线程池装饰器：将父线程的 traceId/spanId 和 MDC 上下文传播到子线程，
 * 保证 @Async、ThreadPool 等异步场景下日志链路完整。
 */
public class TracingTaskDecorator implements TaskDecorator {

    private final Tracer tracer;

    public TracingTaskDecorator(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    public Runnable decorate(Runnable runnable) {
        // 捕获父线程的 MDC 上下文
        Map<String, String> parentMdc = MDC.getCopyOfContextMap();
        // 捕获父线程的当前 Span
        Span parentSpan = tracer.currentSpan();

        return () -> {
            // 恢复 MDC
            if (parentMdc != null) {
                MDC.setContextMap(parentMdc);
            }
            // 创建子 Span，保持与父 Span 的链路关系
            Span asyncSpan = null;
            if (parentSpan != null) {
                TraceContext parentContext = parentSpan.context();
                asyncSpan = tracer.nextSpan(parentSpan)
                        .name("async-task")
                        .start();
                // 将新 span 的 traceId/spanId 写入 MDC
                MDC.put("traceId", asyncSpan.context().traceId());
                MDC.put("spanId", asyncSpan.context().spanId());
            }
            try (var ignored = asyncSpan != null ? tracer.withSpan(asyncSpan) : null) {
                runnable.run();
            } finally {
                if (asyncSpan != null) {
                    asyncSpan.end();
                }
                MDC.clear();
            }
        };
    }
}
