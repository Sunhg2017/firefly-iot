package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskQueryDTO;
import com.songhg.firefly.iot.support.entity.AsyncTask;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import com.songhg.firefly.iot.support.mapper.AsyncTaskMapper;
import com.songhg.firefly.iot.support.mapper.InAppMessageMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 异步任务中心服务。
 * <p>
 * 负责统一维护导入、导出、同步、批处理任务的状态流转，并确保直接按任务 ID
 * 访问时仍然受租户上下文约束，避免跨租户读取和下载任务结果。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncTaskService {

    private static final Map<String, String> TASK_TYPE_LABELS = Map.of(
            "EXPORT", "导出",
            "IMPORT", "导入",
            "SYNC", "同步",
            "BATCH", "批处理"
    );

    private final AsyncTaskMapper asyncTaskMapper;
    private final InAppMessageMapper inAppMessageMapper;
    private final AsyncTaskFileService asyncTaskFileService;

    @Transactional
    public AsyncTask createTask(String taskName, String taskType, String bizType, String fileFormat, String extraData) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        AsyncTask task = new AsyncTask();
        task.setTenantId(tenantId);
        task.setTaskName(taskName);
        task.setTaskType(taskType != null ? taskType : "EXPORT");
        task.setBizType(bizType);
        task.setFileFormat(fileFormat);
        task.setStatus("PENDING");
        task.setProgress(0);
        task.setExtraData(extraData);
        task.setResultSize(0L);
        task.setCreatedBy(userId);
        asyncTaskMapper.insert(task);

        log.info("Async task created: id={}, type={}, bizType={}", task.getId(), task.getTaskType(), task.getBizType());
        return task;
    }

    @Transactional
    public void completeTask(Long taskId, boolean success, String resultUrl, Long resultSize, Integer totalRows, String errorMessage) {
        AsyncTask task = getTaskOrThrow(taskId);
        if (isCancelled(task)) {
            log.info("Skip completing cancelled task: id={}", taskId);
            return;
        }

        task.setStatus(success ? "COMPLETED" : "FAILED");
        task.setProgress(success ? 100 : task.getProgress());
        task.setResultUrl(resultUrl);
        task.setResultSize(resolveResultSize(resultUrl, resultSize));
        task.setTotalRows(totalRows);
        task.setErrorMessage(errorMessage);
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);

        sendCompletionMessage(task, success, errorMessage);
    }

    @Transactional
    public void failTaskWithErrors(Long taskId, String summaryMessage, List<String[]> errors) {
        AsyncTask task = getTaskOrThrow(taskId);
        if (isCancelled(task)) {
            log.info("Skip writing error file for cancelled task: id={}", taskId);
            return;
        }

        String errorFilePath = null;
        long errorFileSize = 0L;
        try {
            errorFilePath = asyncTaskFileService.writeErrorCsv(taskId, errors);
            errorFileSize = asyncTaskFileService.getFileSize(errorFilePath);
        } catch (Exception e) {
            log.warn("Failed to write async task error file: taskId={}, error={}", taskId, e.getMessage());
        }

        task.setStatus("FAILED");
        task.setProgress(0);
        task.setErrorMessage(summaryMessage != null ? summaryMessage : errors.size() + " 条数据处理失败");
        task.setResultUrl(errorFilePath);
        task.setResultSize(errorFileSize);
        task.setTotalRows(errors.size());
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);

        sendCompletionMessage(task, false, task.getErrorMessage());
        log.info("Async task failed with error file: taskId={}, errorCount={}", taskId, errors.size());
    }

    @Transactional
    public void updateProgress(Long taskId, int progress) {
        AsyncTask task = getTaskOrThrow(taskId);
        if (isFinished(task)) {
            return;
        }

        task.setProgress(Math.min(Math.max(progress, 0), 100));
        if (!"PROCESSING".equals(task.getStatus())) {
            task.setStatus("PROCESSING");
        }
        asyncTaskMapper.updateById(task);
    }

    @Transactional
    public void cancelTask(Long taskId) {
        AsyncTask task = getTaskOrThrow(taskId);
        if (isFinished(task)) {
            return;
        }
        task.setStatus("CANCELLED");
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);
        log.info("Async task cancelled: id={}", taskId);
    }

    public IPage<AsyncTask> listTasks(AsyncTaskQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<AsyncTask> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<AsyncTask> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AsyncTask::getTenantId, tenantId);
        if (query.getTaskType() != null && !query.getTaskType().isBlank()) {
            wrapper.eq(AsyncTask::getTaskType, query.getTaskType());
        }
        if (query.getStatus() != null && !query.getStatus().isBlank()) {
            wrapper.eq(AsyncTask::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(AsyncTask::getCreatedAt);
        return asyncTaskMapper.selectPage(page, wrapper);
    }

    public IPage<AsyncTask> listMyTasks(AsyncTaskQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Page<AsyncTask> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<AsyncTask> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AsyncTask::getTenantId, tenantId)
                .eq(AsyncTask::getCreatedBy, userId);
        if (query.getTaskType() != null && !query.getTaskType().isBlank()) {
            wrapper.eq(AsyncTask::getTaskType, query.getTaskType());
        }
        if (query.getStatus() != null && !query.getStatus().isBlank()) {
            wrapper.eq(AsyncTask::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(AsyncTask::getCreatedAt);
        return asyncTaskMapper.selectPage(page, wrapper);
    }

    public AsyncTask getTask(Long id) {
        return getTaskOrThrow(id);
    }

    @Transactional
    public void deleteTask(Long id) {
        AsyncTask task = getTaskOrThrow(id);
        asyncTaskFileService.deleteStoredResult(task.getResultUrl());
        asyncTaskMapper.deleteById(task.getId());
    }

    @Transactional
    public int cleanExpiredTasks() {
        Long tenantId = AppContextHolder.getTenantId();
        LocalDateTime threshold = LocalDateTime.now().minusDays(7);
        List<AsyncTask> expired = asyncTaskMapper.selectList(new LambdaQueryWrapper<AsyncTask>()
                .eq(AsyncTask::getTenantId, tenantId)
                .lt(AsyncTask::getCreatedAt, threshold));

        int count = 0;
        for (AsyncTask task : expired) {
            deleteTask(task.getId());
            count++;
        }
        if (count > 0) {
            log.info("Expired async tasks cleaned: tenantId={}, count={}", tenantId, count);
        }
        return count;
    }

    private AsyncTask getTaskOrThrow(Long taskId) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        Long tenantId = AppContextHolder.getTenantId();
        if (task == null || !Objects.equals(task.getTenantId(), tenantId)) {
            throw new BizException(ResultCode.NOT_FOUND, "任务不存在");
        }
        return task;
    }

    private long resolveResultSize(String resultUrl, Long resultSize) {
        if (resultSize != null && resultSize >= 0) {
            return resultSize;
        }
        if (resultUrl == null || resultUrl.isBlank()) {
            return 0L;
        }
        return asyncTaskFileService.getFileSize(resultUrl);
    }

    private boolean isFinished(AsyncTask task) {
        return "COMPLETED".equals(task.getStatus())
                || "FAILED".equals(task.getStatus())
                || "CANCELLED".equals(task.getStatus());
    }

    private boolean isCancelled(AsyncTask task) {
        return "CANCELLED".equals(task.getStatus());
    }

    private void sendCompletionMessage(AsyncTask task, boolean success, String errorMsg) {
        try {
            if (task.getCreatedBy() == null) {
                return;
            }

            String typeLabel = TASK_TYPE_LABELS.getOrDefault(task.getTaskType(), task.getTaskType());
            String title = success
                    ? typeLabel + "任务完成: " + task.getTaskName()
                    : typeLabel + "任务失败: " + task.getTaskName();
            String content = success
                    ? "您的" + typeLabel + "任务《" + task.getTaskName() + "》已完成"
                      + (task.getTotalRows() != null ? "，共处理 " + task.getTotalRows() + " 条数据" : "")
                      + (errorMsg != null && !errorMsg.isBlank() ? "。提示：" + errorMsg : "")
                      + "。"
                    : "您的" + typeLabel + "任务《" + task.getTaskName() + "》执行失败"
                      + (errorMsg != null ? "，错误信息: " + errorMsg : "")
                      + "。";

            InAppMessage message = new InAppMessage();
            message.setTenantId(task.getTenantId());
            message.setUserId(task.getCreatedBy());
            message.setTitle(title);
            message.setContent(content);
            message.setType("TASK");
            message.setLevel(success ? "INFO" : "WARNING");
            message.setSource("ASYNC_TASK");
            message.setSourceId(String.valueOf(task.getId()));
            message.setIsRead(false);
            message.setCreatedBy(task.getCreatedBy());
            inAppMessageMapper.insert(message);

            log.info("Async task completion message sent: taskId={}, userId={}, success={}",
                    task.getId(), task.getCreatedBy(), success);
        } catch (Exception e) {
            log.warn("Failed to send async task completion message: taskId={}, error={}",
                    task.getId(), e.getMessage());
        }
    }
}
