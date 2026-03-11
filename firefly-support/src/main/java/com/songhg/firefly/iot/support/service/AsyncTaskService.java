package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
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

/**
 * 异步任务服务
 * <p>
 * 负责任务的创建、状态管理、进度更新、查询和清理。
 * 文件 I/O 操作委托给 {@link AsyncTaskFileService}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncTaskService {

    private final AsyncTaskMapper asyncTaskMapper;
    private final InAppMessageMapper inAppMessageMapper;
    private final AsyncTaskFileService asyncTaskFileService;

    // ==================== 创建任务 ====================

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

        log.info("异步任务已创建: id={}, type={}, bizType={}", task.getId(), taskType, bizType);
        return task;
    }

    // ==================== 完成任务（通用） ====================

    @Transactional
    public void completeTask(Long taskId, boolean success, String resultUrl, Long resultSize, Integer totalRows, String errorMessage) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        task.setStatus(success ? "COMPLETED" : "FAILED");
        task.setProgress(success ? 100 : task.getProgress());
        task.setResultUrl(resultUrl);
        task.setResultSize(resultSize != null ? resultSize : 0L);
        task.setTotalRows(totalRows);
        task.setErrorMessage(errorMessage);
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);

        sendCompletionMessage(task, success, errorMessage);
    }

    // ==================== 标记失败（含错误详情文件） ====================

    /**
     * 将任务标记为失败，并将逐行错误信息写入 CSV 文件，供用户下载错误清单。
     *
     * @param taskId         任务ID
     * @param summaryMessage 概要错误信息
     * @param errors         每行错误 [行号, 错误原因]
     */
    @Transactional
    public void failTaskWithErrors(Long taskId, String summaryMessage, List<String[]> errors) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        String errorFilePath = null;
        long errorFileSize = 0;
        try {
            errorFilePath = asyncTaskFileService.writeErrorCsv(taskId, errors);
            errorFileSize = asyncTaskFileService.getFileSize(errorFilePath);
        } catch (Exception e) {
            log.warn("写入错误详情文件失败: taskId={}, error={}", taskId, e.getMessage());
        }

        task.setStatus("FAILED");
        task.setProgress(0);
        task.setErrorMessage(summaryMessage != null ? summaryMessage : errors.size() + " 条数据导入失败");
        task.setResultUrl(errorFilePath);
        task.setResultSize(errorFileSize);
        task.setTotalRows(errors.size());
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);

        sendCompletionMessage(task, false, task.getErrorMessage());
        log.info("任务失败，共 {} 条错误，错误文件: {}", errors.size(), errorFilePath);
    }

    // ==================== 更新进度 ====================

    @Transactional
    public void updateProgress(Long taskId, int progress) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;
        task.setProgress(Math.min(progress, 100));
        if (!"PROCESSING".equals(task.getStatus())) {
            task.setStatus("PROCESSING");
        }
        asyncTaskMapper.updateById(task);
    }

    // ==================== 取消任务 ====================

    @Transactional
    public void cancelTask(Long taskId) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;
        if ("COMPLETED".equals(task.getStatus()) || "FAILED".equals(task.getStatus())) return;
        task.setStatus("CANCELLED");
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);
        log.info("异步任务已取消: id={}", taskId);
    }

    // ==================== 查询 ====================

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
        wrapper.orderByDesc(AsyncTask::getCreatedAt);
        return asyncTaskMapper.selectPage(page, wrapper);
    }

    public AsyncTask getTask(Long id) {
        return asyncTaskMapper.selectById(id);
    }

    // ==================== 删除 ====================

    @Transactional
    public void deleteTask(Long id) {
        AsyncTask task = asyncTaskMapper.selectById(id);
        if (task != null && task.getResultUrl() != null) {
            asyncTaskFileService.deleteFile(task.getResultUrl());
        }
        asyncTaskMapper.deleteById(id);
    }

    // ==================== 清理过期任务 ====================

    @Transactional
    public int cleanExpiredTasks() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(7);
        List<AsyncTask> expired = asyncTaskMapper.selectList(new LambdaQueryWrapper<AsyncTask>()
                .lt(AsyncTask::getCreatedAt, threshold));
        int count = 0;
        for (AsyncTask task : expired) {
            deleteTask(task.getId());
            count++;
        }
        if (count > 0) log.info("已清理 {} 个过期异步任务", count);
        return count;
    }

    // ==================== 内部方法 ====================

    private static final Map<String, String> TASK_TYPE_LABELS = Map.of(
            "EXPORT", "导出",
            "IMPORT", "导入",
            "SYNC", "同步",
            "BATCH", "批处理"
    );

    private void sendCompletionMessage(AsyncTask task, boolean success, String errorMsg) {
        try {
            if (task.getCreatedBy() == null) return;

            String typeLabel = TASK_TYPE_LABELS.getOrDefault(task.getTaskType(), task.getTaskType());
            String title = success
                    ? typeLabel + "任务完成: " + task.getTaskName()
                    : typeLabel + "任务失败: " + task.getTaskName();
            String content = success
                    ? "您的" + typeLabel + "任务「" + task.getTaskName() + "」已完成"
                      + (task.getTotalRows() != null ? "，共处理 " + task.getTotalRows() + " 条数据" : "")
                      + "。"
                    : "您的" + typeLabel + "任务「" + task.getTaskName() + "」执行失败"
                      + (errorMsg != null ? "，错误信息: " + errorMsg : "")
                      + "。";

            InAppMessage msg = new InAppMessage();
            msg.setTenantId(task.getTenantId());
            msg.setUserId(task.getCreatedBy());
            msg.setTitle(title);
            msg.setContent(content);
            msg.setType("TASK");
            msg.setLevel(success ? "INFO" : "WARNING");
            msg.setSource("ASYNC_TASK");
            msg.setSourceId(String.valueOf(task.getId()));
            msg.setIsRead(false);
            msg.setCreatedBy(task.getCreatedBy());
            inAppMessageMapper.insert(msg);

            log.info("站内消息已发送: taskId={}, userId={}, success={}", task.getId(), task.getCreatedBy(), success);
        } catch (Exception e) {
            log.warn("发送站内消息失败: taskId={}, error={}", task.getId(), e.getMessage());
        }
    }
}
