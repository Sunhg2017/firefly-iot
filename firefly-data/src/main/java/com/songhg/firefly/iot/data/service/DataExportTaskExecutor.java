package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.common.context.AsyncContextHelper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.data.dto.analysis.DataExportDTO;
import com.songhg.firefly.iot.data.dto.analysis.DataExportResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 异步执行数据分析导出。
 * <p>
 * 导出文件最终存储到 MinIO，任务中心只保留对象 Key，
 * 这样 support 服务可以在下载时统一换取预签名地址。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataExportTaskExecutor {

    private static final DateTimeFormatter FILE_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final int MAX_ERROR_MESSAGE_LENGTH = 500;

    private final DataAnalysisService dataAnalysisService;
    private final AsyncTaskClient asyncTaskClient;
    private final FileClient fileClient;

    @Async("taskExecutor")
    public void executeExportAsync(Long taskId, DataExportDTO dto, Long tenantId, Long userId) {
        try {
            AsyncContextHelper.setContext(tenantId, userId);

            if (!shouldContinue(taskId, 10)) {
                log.info("Skip querying cancelled export task: taskId={}", taskId);
                return;
            }
            DataExportResult exportResult = dataAnalysisService.queryExportData(dto);

            if (!shouldContinue(taskId, 60)) {
                log.info("Skip building CSV for cancelled export task: taskId={}", taskId);
                return;
            }
            byte[] csvBytes = buildCsv(exportResult.getRecords());

            if (!shouldContinue(taskId, 85)) {
                log.info("Skip uploading CSV for cancelled export task: taskId={}", taskId);
                return;
            }
            String objectName = buildObjectName(tenantId);
            R<Map<String, String>> uploadResult = fileClient.uploadBytes(objectName, "text/csv;charset=UTF-8", csvBytes);
            if (uploadResult == null || uploadResult.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "上传导出文件失败");
            }

            String storedObjectName = uploadResult.getData().getOrDefault("objectName", objectName);
            String taskMessage = exportResult.isTruncated()
                    ? "导出结果已按上限 50000 条截断，请缩小筛选范围后重试"
                    : null;
            boolean completed = shouldComplete(taskId, storedObjectName, csvBytes.length,
                    exportResult.getRecords().size(), taskMessage);
            if (!completed) {
                log.info("Skip finishing cancelled export task after upload: taskId={}, objectName={}",
                        taskId, storedObjectName);
                return;
            }
            log.info("Data export completed: taskId={}, tenantId={}, rows={}",
                    taskId, tenantId, exportResult.getRecords().size());
        } catch (Exception e) {
            log.error("Data export failed: taskId={}, error={}", taskId, e.getMessage(), e);
            asyncTaskClient.failTask(taskId, truncateMessage("导出失败: " + e.getMessage()));
        } finally {
            AsyncContextHelper.clearContext();
        }
    }

    private byte[] buildCsv(List<Map<String, Object>> records) {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(outputStream, StandardCharsets.UTF_8))) {
            writer.write('\ufeff');
            writer.println("时间,产品Key,产品名称,设备名称,设备别名,属性,数值,字符值");
            for (Map<String, Object> row : records) {
                writer.printf("%s,%s,%s,%s,%s,%s,%s,%s%n",
                        escapeCsv(row.get("time")),
                        escapeCsv(row.get("product_key")),
                        escapeCsv(row.get("product_name")),
                        escapeCsv(row.get("device_name")),
                        escapeCsv(row.get("device_nickname")),
                        escapeCsv(row.get("property_name")),
                        escapeCsv(row.get("value_double")),
                        escapeCsv(row.get("value_string")));
            }
            writer.flush();
        }
        return outputStream.toByteArray();
    }

    private String buildObjectName(Long tenantId) {
        return tenantId + "/exports/data-analysis/custom-export_"
                + LocalDateTime.now().format(FILE_TIME)
                + "_"
                + UUID.randomUUID().toString().replace("-", "")
                + ".csv";
    }

    private String truncateMessage(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > MAX_ERROR_MESSAGE_LENGTH
                ? message.substring(0, MAX_ERROR_MESSAGE_LENGTH)
                : message;
    }

    private String escapeCsv(Object value) {
        String text = value == null ? "" : String.valueOf(value);
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }

    private boolean shouldContinue(Long taskId, int progress) {
        R<Boolean> progressResult = asyncTaskClient.updateProgress(taskId, progress);
        return progressResult == null
                || progressResult.getData() == null
                || Boolean.TRUE.equals(progressResult.getData());
    }

    private boolean shouldComplete(Long taskId, String storedObjectName, int resultSize, int totalRows, String taskMessage) {
        // The support service now cleans up the stored object if the task was cancelled
        // after upload but before the completion callback reached the task center.
        R<Boolean> completeResult = asyncTaskClient.completeTask(taskId, true, storedObjectName, (long) resultSize,
                totalRows, taskMessage);
        return completeResult == null
                || completeResult.getData() == null
                || Boolean.TRUE.equals(completeResult.getData());
    }
}
