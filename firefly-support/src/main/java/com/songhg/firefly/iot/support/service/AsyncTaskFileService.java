package com.songhg.firefly.iot.support.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 异步任务结果文件服务。
 * <p>
 * 兼容两类结果存储：
 * 1. support 服务本地生成的临时 CSV 文件；
 * 2. 其他微服务异步生成后上传到 MinIO 的导出文件。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncTaskFileService {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final MinioService minioService;

    @Value("${async.task.storage-dir:async-tasks}")
    private String storageDir;

    public String writeCsv(String bizType, List<Map<String, Object>> data, List<String> columns, List<String> headers)
            throws IOException {
        ensureDirectory();

        String fileName = (bizType != null ? bizType : "export")
                + "_" + LocalDateTime.now().format(FMT)
                + "_" + UUID.randomUUID().toString().substring(0, 8)
                + ".csv";
        Path filePath = Path.of(storageDir, fileName);

        try (Writer writer = Files.newBufferedWriter(filePath, StandardCharsets.UTF_8)) {
            writer.write('\ufeff');
            writer.write(String.join(",", headers));
            writer.write(System.lineSeparator());

            for (Map<String, Object> row : data) {
                StringBuilder line = new StringBuilder();
                for (int i = 0; i < columns.size(); i++) {
                    if (i > 0) {
                        line.append(',');
                    }
                    line.append(escapeCsv(row.get(columns.get(i))));
                }
                writer.write(line.toString());
                writer.write(System.lineSeparator());
            }
        }

        log.info("CSV result written: {}", filePath);
        return filePath.toString();
    }

    public String writeErrorCsv(Long taskId, List<String[]> errors) throws IOException {
        ensureDirectory();

        String fileName = "error_" + taskId + "_" + LocalDateTime.now().format(FMT) + ".csv";
        Path filePath = Path.of(storageDir, fileName);

        try (Writer writer = Files.newBufferedWriter(filePath, StandardCharsets.UTF_8)) {
            writer.write('\ufeff');
            writer.write("行号,错误原因");
            writer.write(System.lineSeparator());

            for (String[] row : errors) {
                String rowNum = row.length > 0 ? row[0] : "";
                String reason = row.length > 1 ? row[1] : "";
                writer.write(escapeCsv(rowNum));
                writer.write(',');
                writer.write(escapeCsv(reason));
                writer.write(System.lineSeparator());
            }
        }

        log.info("Async task error file written: taskId={}, path={}", taskId, filePath);
        return filePath.toString();
    }

    public boolean isLocalFile(String storedPath) {
        Path path = toLocalPath(storedPath);
        return path != null && Files.exists(path);
    }

    public boolean exists(String storedPath) {
        if (isLocalFile(storedPath)) {
            return true;
        }
        return storedPath != null && !storedPath.isBlank() && minioService.exists(storedPath);
    }

    public String getDownloadUrl(String storedPath) {
        if (storedPath == null || storedPath.isBlank() || isLocalFile(storedPath)) {
            return null;
        }
        if (!minioService.exists(storedPath)) {
            return null;
        }
        return minioService.getPresignedUrl(storedPath);
    }

    public void deleteStoredResult(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            return;
        }

        Path localPath = toLocalPath(storedPath);
        if (localPath != null && Files.exists(localPath)) {
            try {
                Files.deleteIfExists(localPath);
            } catch (IOException e) {
                log.warn("Failed to delete local async task file: {}", storedPath, e);
            }
            return;
        }

        if (minioService.exists(storedPath)) {
            minioService.delete(storedPath);
        }
    }

    public long getFileSize(String storedPath) {
        Path localPath = toLocalPath(storedPath);
        if (localPath != null && Files.exists(localPath)) {
            try {
                return Files.size(localPath);
            } catch (IOException e) {
                log.warn("Failed to read async task file size: {}", storedPath, e);
            }
        }
        return 0L;
    }

    private Path toLocalPath(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            return null;
        }
        try {
            return Path.of(storedPath);
        } catch (InvalidPathException ex) {
            return null;
        }
    }

    private void ensureDirectory() throws IOException {
        Path dir = Path.of(storageDir);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
    }

    private String escapeCsv(Object value) {
        String text = value == null ? "" : String.valueOf(value);
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}
