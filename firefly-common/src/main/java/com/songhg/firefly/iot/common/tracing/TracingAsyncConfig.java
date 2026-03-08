package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Tracer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * 统一异步线程池配置，内置链路追踪上下文传播。
 * 各微服务模块引入 firefly-common 后自动生效，无需再单独配置 AsyncConfig。
 */
@Configuration
@EnableAsync
@ConditionalOnBean(Tracer.class)
public class TracingAsyncConfig {

    @Bean("taskExecutor")
    public Executor taskExecutor(Tracer tracer) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(32);
        executor.setQueueCapacity(256);
        executor.setThreadNamePrefix("async-trace-");
        executor.setTaskDecorator(new TracingTaskDecorator(tracer));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
