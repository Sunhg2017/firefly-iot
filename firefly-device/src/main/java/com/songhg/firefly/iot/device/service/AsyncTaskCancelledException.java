package com.songhg.firefly.iot.device.service;

/**
 * 异步任务已被取消/已结束时抛出，用于立即停止导入线程的后续下载、解析与写入。
 */
public class AsyncTaskCancelledException extends RuntimeException {

    public AsyncTaskCancelledException(String message) {
        super(message);
    }
}
