package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 异步任务服务 Feign Client（供其他微服务调用 support 服务的异步任务功能）
 */
@FeignClient(name = "firefly-support", contextId = "asyncTaskClient", path = "/api/v1/async-tasks")
public interface AsyncTaskClient {

    /**
     * 创建异步任务
     */
    @PostMapping
    R<Map<String, Object>> createTask(@RequestBody Map<String, Object> taskData);

    /**
     * 更新任务进度
     */
    @PutMapping("/{taskId}/progress")
    R<Void> updateProgress(@PathVariable("taskId") Long taskId, @RequestParam("progress") Integer progress);

    /**
     * 完成任务
     */
    @PutMapping("/{taskId}/complete")
    R<Void> completeTask(@PathVariable("taskId") Long taskId,
                         @RequestParam(value = "success", defaultValue = "true") Boolean success,
                         @RequestParam(value = "resultUrl", required = false) String resultUrl,
                         @RequestParam(value = "totalRows", required = false) Integer totalRows,
                         @RequestParam(value = "errorMessage", required = false) String errorMessage);

    /**
     * 标记任务失败并记录错误信息
     */
    @PutMapping("/{taskId}/fail")
    R<Void> failTask(@PathVariable("taskId") Long taskId,
                     @RequestParam("errorMessage") String errorMessage);
}
