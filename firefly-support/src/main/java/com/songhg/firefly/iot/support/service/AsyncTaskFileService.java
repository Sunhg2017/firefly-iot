package com.songhg.firefly.iot.support.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 异步任务文件存储服务
 * <p>
 * 负责异步任务产生的 CSV 结果文件和错误文件的写入、删除等操作。
 * 存储目录通过配置 async.task.storage-dir 注入，默认为 async-tasks。
 */
@Slf4j
@Service
public class AsyncTaskFileService {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Value("${async.task.storage-dir:async-tasks}")
    private String storageDir;

    /**
     * 写入 CSV 导出文件
     *
     * @param bizType 业务类型，用于文件名前缀
     * @param data    数据行
     * @param columns 字段名列表（取数据用）
     * @param headers 表头显示名列表
     * @return 文件绝对路径
     */
    public String writeCsv(String bizType, List<Map<String, Object>> data, List<String> columns, List<String> headers) throws IOException {
        ensureDirectory();

        String fileName = (bizType != null ? bizType : "export")
                + "_" + LocalDateTime.now().format(FMT)
                + "_" + UUID.randomUUID().toString().substring(0, 8)
                + ".csv";
        Path filePath = Path.of(storageDir, fileName);

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath.toFile()))) {
            // UTF-8 BOM
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

        log.info("CSV 文件已写入: {}", filePath);
        return filePath.toString();
    }

    /**
     * 写入错误详情 CSV 文件（供导入失败时下载错误清单）
     *
     * @param taskId 任务ID
     * @param errors 每行错误 [行号, 错误原因]
     * @return 文件绝对路径
     */
    public String writeErrorCsv(Long taskId, List<String[]> errors) throws IOException {
        ensureDirectory();

        String fileName = "error_" + taskId + "_" + LocalDateTime.now().format(FMT) + ".csv";
        Path filePath = Path.of(storageDir, fileName);

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filePath.toFile()))) {
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

        log.info("错误详情文件已写入: taskId={}, path={}", taskId, filePath);
        return filePath.toString();
    }

    /**
     * 删除文件
     *
     * @param filePath 文件路径
     */
    public void deleteFile(String filePath) {
        if (filePath == null || filePath.isBlank()) return;
        try {
            Files.deleteIfExists(Path.of(filePath));
        } catch (IOException e) {
            log.warn("删除异步任务文件失败: {}", filePath, e);
        }
    }

    /**
     * 获取文件大小
     */
    public long getFileSize(String filePath) {
        if (filePath == null || filePath.isBlank()) return 0;
        try {
            return Files.size(Path.of(filePath));
        } catch (IOException e) {
            return 0;
        }
    }

    private void ensureDirectory() throws IOException {
        Path dir = Path.of(storageDir);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
    }
}
