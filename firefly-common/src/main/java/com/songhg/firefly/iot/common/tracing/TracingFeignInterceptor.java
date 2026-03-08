package com.songhg.firefly.iot.common.tracing;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.slf4j.MDC;

/**
 * Feign RequestInterceptor：在每次跨服务调用时自动注入链路追踪 Header。
 * <ul>
 *   <li>X-Trace-Id / X-Span-Id：自定义 Header，下游 TracingMdcFilter 读取写入 MDC</li>
 *   <li>traceparent：W3C 标准 Header，下游 Micrometer 自动关联 Span 父子关系</li>
 * </ul>
 */
public class TracingFeignInterceptor implements RequestInterceptor {

    private static final String TRACE_ID_HEADER = "X-Trace-Id";
    private static final String SPAN_ID_HEADER = "X-Span-Id";
    private static final String TRACEPARENT_HEADER = "traceparent";

    private final Tracer tracer;

    public TracingFeignInterceptor(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    public void apply(RequestTemplate template) {
        String traceId = null;
        String spanId = null;

        // 优先从 Tracer 获取当前 Span
        Span currentSpan = tracer.currentSpan();
        if (currentSpan != null) {
            traceId = currentSpan.context().traceId();
            spanId = currentSpan.context().spanId();
        }

        // 兜底从 MDC 获取（适用于异步线程已由 TaskDecorator 传播 MDC 的场景）
        if (traceId == null) {
            traceId = MDC.get("traceId");
            spanId = MDC.get("spanId");
        }

        if (traceId != null) {
            template.header(TRACE_ID_HEADER, traceId);
            // W3C traceparent: 00-{traceId}-{spanId}-01
            String traceparent = String.format("00-%s-%s-01",
                    traceId, spanId != null ? spanId : "0000000000000000");
            template.header(TRACEPARENT_HEADER, traceparent);
        }
        if (spanId != null) {
            template.header(SPAN_ID_HEADER, spanId);
        }
    }
}
