package com.songhg.firefly.iot.common.tracing;

import io.micrometer.tracing.Tracer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * 统一异步线程池配置。
 * 即使未启用链路追踪也必须注册可用的 taskExecutor，避免 @Async / 任务分发退化为同步执行。
 * 存在 Tracer 时额外挂载链路上下文传播装饰器。
 */
@Configuration
@EnableAsync
public class TracingAsyncConfig {

    @Bean("taskExecutor")
    public Executor taskExecutor(ObjectProvider<Tracer> tracerProvider) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(32);
        executor.setQueueCapacity(256);
        executor.setThreadNamePrefix("async-trace-");
        Tracer tracer = tracerProvider.getIfAvailable();
        if (tracer != null) {
            executor.setTaskDecorator(new TracingTaskDecorator(tracer));
        }
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
