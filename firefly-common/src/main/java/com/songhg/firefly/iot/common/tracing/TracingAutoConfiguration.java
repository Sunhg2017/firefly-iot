package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Tracer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 链路追踪自动配置：
 * 1. 注册 TracingMdcFilter（Servlet 环境自动生效）
 * 2. 注册 TracingFeignInterceptor（Feign 环境自动生效）
 * 3. TracingAsyncConfig 独立配置（自动注入带链路传播的线程池）
 */
@Configuration
@ConditionalOnBean(Tracer.class)
public class TracingAutoConfiguration {

    @Bean
    @ConditionalOnClass(name = "jakarta.servlet.Filter")
    public FilterRegistrationBean<TracingMdcFilter> tracingMdcFilter(Tracer tracer) {
        FilterRegistrationBean<TracingMdcFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new TracingMdcFilter(tracer));
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        registration.setName("tracingMdcFilter");
        return registration;
    }

    @Bean
    @ConditionalOnClass(name = "feign.RequestInterceptor")
    public TracingFeignInterceptor tracingFeignInterceptor(Tracer tracer) {
        return new TracingFeignInterceptor(tracer);
    }
}
