package com.songhg.firefly.iot.gateway.filter;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * 网关链路追踪 GlobalFilter：
 * <ol>
 *   <li>从 Micrometer Tracer 获取当前 traceId / spanId</li>
 *   <li>注入 X-Trace-Id / X-Span-Id 到下游请求 Header</li>
 *   <li>同时注入 W3C traceparent Header，确保下游微服务自动关联链路</li>
 *   <li>在 Response Header 中回写 X-Trace-Id 供前端/运维定位日志</li>
 * </ol>
 *
 * <p>Order = -200，优先级高于 AuthGlobalFilter(-100)，保证所有请求（含白名单）都有链路。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TracingGlobalFilter implements GlobalFilter, Ordered {

    private static final String TRACE_ID_HEADER = "X-Trace-Id";
    private static final String SPAN_ID_HEADER = "X-Span-Id";
    private static final String TRACEPARENT_HEADER = "traceparent";

    private final Tracer tracer;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        Span currentSpan = tracer.currentSpan();
        if (currentSpan == null) {
            return chain.filter(exchange);
        }

        String traceId = currentSpan.context().traceId();
        String spanId = currentSpan.context().spanId();

        // 构建 W3C traceparent: version-traceId-spanId-flags
        String traceparent = String.format("00-%s-%s-01", traceId, spanId);

        // 注入下游请求 Header
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header(TRACE_ID_HEADER, traceId)
                .header(SPAN_ID_HEADER, spanId)
                .header(TRACEPARENT_HEADER, traceparent)
                .build();

        // 回写 Response Header
        exchange.getResponse().getHeaders().set(TRACE_ID_HEADER, traceId);

        return chain.filter(exchange.mutate().request(mutated).build());
    }

    @Override
    public int getOrder() {
        return -200;
    }
}
