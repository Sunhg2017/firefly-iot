package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskQueryDTO;
import com.songhg.firefly.iot.support.entity.AsyncTask;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import com.songhg.firefly.iot.support.mapper.AsyncTaskMapper;
import com.songhg.firefly.iot.support.mapper.InAppMessageMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncTaskService {

    private final AsyncTaskMapper asyncTaskMapper;
    private final InAppMessageMapper inAppMessageMapper;

    private static final String TASK_DIR = "async-tasks";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    // ==================== Create ====================

    @Transactional
    public AsyncTask createTask(String taskName, String taskType, String bizType, String fileFormat, String queryParams) {
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();

        AsyncTask task = new AsyncTask();
        task.setTenantId(tenantId);
        task.setTaskName(taskName);
        task.setTaskType(taskType != null ? taskType : "EXPORT");
        task.setBizType(bizType);
        task.setFileFormat(fileFormat);
        task.setStatus("PENDING");
        task.setProgress(0);
        task.setQueryParams(queryParams);
        task.setCreatedBy(userId);
        asyncTaskMapper.insert(task);

        log.info("Async task created: id={}, type={}, bizType={}", task.getId(), taskType, bizType);
        return task;
    }

    // ==================== Execute Export (async) ====================

    @Async
    public void executeExport(Long taskId, List<Map<String, Object>> data, List<String> columns, List<String> headers) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        try {
            updateProgress(task, "PROCESSING", 10);

            String fileName = (task.getBizType() != null ? task.getBizType() : "export")
                    + "_" + LocalDateTime.now().format(FMT)
                    + "_" + UUID.randomUUID().toString().substring(0, 8);

            String filePath;
            if ("CSV".equalsIgnoreCase(task.getFileFormat())) {
                filePath = writeCsv(fileName, data, columns, headers);
            } else {
                filePath = writeCsv(fileName, data, columns, headers);
            }

            File file = new File(filePath);
            task.setStatus("COMPLETED");
            task.setProgress(100);
            task.setResultUrl(filePath);
            task.setResultSize(file.length());
            task.setTotalRows(data.size());
            task.setCompletedAt(LocalDateTime.now());
            asyncTaskMapper.updateById(task);

            sendCompletionMessage(task, true, null);
            log.info("Export completed: taskId={}, rows={}, file={}", taskId, data.size(), filePath);
        } catch (Exception e) {
            task.setStatus("FAILED");
            task.setProgress(0);
            task.setErrorMessage(e.getMessage());
            task.setCompletedAt(LocalDateTime.now());
            asyncTaskMapper.updateById(task);

            sendCompletionMessage(task, false, e.getMessage());
            log.error("Export failed: taskId={}, error={}", taskId, e.getMessage(), e);
        }
    }

    // ==================== Execute Import (async) ====================

    @Async
    public void executeImport(Long taskId, InputStream inputStream) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        try {
            updateProgress(task, "PROCESSING", 10);

            // Read the import file and count rows
            int rowCount = 0;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
                boolean isHeader = true;
                while (reader.readLine() != null) {
                    if (isHeader) { isHeader = false; continue; }
                    rowCount++;
                }
            }

            task.setStatus("COMPLETED");
            task.setProgress(100);
            task.setTotalRows(rowCount);
            task.setCompletedAt(LocalDateTime.now());
            asyncTaskMapper.updateById(task);

            sendCompletionMessage(task, true, null);
            log.info("Import completed: taskId={}, rows={}", taskId, rowCount);
        } catch (Exception e) {
            task.setStatus("FAILED");
            task.setProgress(0);
            task.setErrorMessage(e.getMessage());
            task.setCompletedAt(LocalDateTime.now());
            asyncTaskMapper.updateById(task);

            sendCompletionMessage(task, false, e.getMessage());
            log.error("Import failed: taskId={}, error={}", taskId, e.getMessage(), e);
        }
    }

    // ==================== Complete task (generic) ====================

    @Transactional
    public void completeTask(Long taskId, boolean success, String resultUrl, Long resultSize, Integer totalRows, String errorMessage) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        task.setStatus(success ? "COMPLETED" : "FAILED");
        task.setProgress(success ? 100 : task.getProgress());
        task.setResultUrl(resultUrl);
        task.setResultSize(resultSize);
        task.setTotalRows(totalRows);
        task.setErrorMessage(errorMessage);
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);

        sendCompletionMessage(task, success, errorMessage);
    }

    // ==================== Fail task with error detail file ====================

    /**
     * 将任务标记为失败，并将逐行错误信息写入 CSV 文件，供用户下载错误清单。
     * @param errors 每行错误 [行号, 错误原因]
     */
    @Transactional
    public void failTaskWithErrors(Long taskId, String summaryMessage, List<String[]> errors) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;

        String errorFilePath = null;
        long errorFileSize = 0;
        try {
            Path dir = Paths.get(TASK_DIR);
            if (!Files.exists(dir)) Files.createDirectories(dir);

            String fileName = "error_" + taskId + "_" + LocalDateTime.now().format(FMT) + ".csv";
            String filePath = TASK_DIR + File.separator + fileName;
            try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath))) {
                writer.write('\ufeff');
                writer.write("行号,错误原因");
                writer.newLine();
                for (String[] row : errors) {
                    String rowNum = row.length > 0 ? row[0] : "";
                    String reason = row.length > 1 ? row[1] : "";
                    if (reason.contains(",") || reason.contains("\"") || reason.contains("\n")) {
                        reason = "\"" + reason.replace("\"", "\"\"") + "\"";
                    }
                    writer.write(rowNum + "," + reason);
                    writer.newLine();
                }
            }
            File file = new File(filePath);
            errorFilePath = filePath;
            errorFileSize = file.length();
        } catch (IOException e) {
            log.warn("Failed to write error detail file for task {}: {}", taskId, e.getMessage());
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
        log.info("Task failed with {} error(s), error file: {}", errors.size(), errorFilePath);
    }

    // ==================== Update progress ====================

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

    // ==================== Cancel ====================

    @Transactional
    public void cancelTask(Long taskId) {
        AsyncTask task = asyncTaskMapper.selectById(taskId);
        if (task == null) return;
        if ("COMPLETED".equals(task.getStatus()) || "FAILED".equals(task.getStatus())) return;
        task.setStatus("CANCELLED");
        task.setCompletedAt(LocalDateTime.now());
        asyncTaskMapper.updateById(task);
        log.info("Async task cancelled: id={}", taskId);
    }

    // ==================== Query ====================

    public IPage<AsyncTask> listTasks(AsyncTaskQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
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
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();
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

    // ==================== Delete ====================

    @Transactional
    public void deleteTask(Long id) {
        AsyncTask task = asyncTaskMapper.selectById(id);
        if (task != null && task.getResultUrl() != null) {
            try {
                Files.deleteIfExists(Paths.get(task.getResultUrl()));
            } catch (IOException e) {
                log.warn("Failed to delete async task file: {}", task.getResultUrl());
            }
        }
        asyncTaskMapper.deleteById(id);
    }

    // ==================== Clean expired ====================

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
        if (count > 0) log.info("Cleaned {} expired async tasks", count);
        return count;
    }

    // ==================== Private helpers ====================

    private void updateProgress(AsyncTask task, String status, int progress) {
        task.setStatus(status);
        task.setProgress(progress);
        asyncTaskMapper.updateById(task);
    }

    private String writeCsv(String fileName, List<Map<String, Object>> data, List<String> columns, List<String> headers) throws IOException {
        Path dir = Paths.get(TASK_DIR);
        if (!Files.exists(dir)) Files.createDirectories(dir);

        String filePath = TASK_DIR + File.separator + fileName + ".csv";
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath))) {
            writer.write('\ufeff');
            writer.write(String.join(",", headers));
            writer.newLine();
            for (Map<String, Object> row : data) {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < columns.size(); i++) {
                    if (i > 0) sb.append(",");
                    Object val = row.get(columns.get(i));
                    String str = val != null ? val.toString() : "";
                    if (str.contains(",") || str.contains("\"") || str.contains("\n")) {
                        str = "\"" + str.replace("\"", "\"\"") + "\"";
                    }
                    sb.append(str);
                }
                writer.write(sb.toString());
                writer.newLine();
            }
        }
        return filePath;
    }

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

            log.info("In-app message sent for async task: taskId={}, userId={}, success={}", task.getId(), task.getCreatedBy(), success);
        } catch (Exception e) {
            log.warn("Failed to send in-app message for task {}: {}", task.getId(), e.getMessage());
        }
    }
}
