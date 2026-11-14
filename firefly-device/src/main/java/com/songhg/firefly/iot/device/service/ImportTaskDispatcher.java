package com.songhg.firefly.iot.device.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;

/**
 * 导入任务分发器：把注册后的导入执行体提交到独立线程池，确保注册接口立即返回 taskId。
 * 通过独立组件调用，避免 Service 内部自调用绕过异步代理。
 */
@Component
public class ImportTaskDispatcher {

    private final Executor taskExecutor;

    public ImportTaskDispatcher(@Qualifier("taskExecutor") Executor taskExecutor) {
        this.taskExecutor = taskExecutor;
    }

    public void dispatch(Runnable task) {
        taskExecutor.execute(task);
    }
}
