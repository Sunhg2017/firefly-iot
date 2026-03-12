package com.songhg.firefly.iot.support.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.convert.AsyncTaskConvert;
import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskQueryDTO;
import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskVO;
import com.songhg.firefly.iot.support.entity.AsyncTask;
import com.songhg.firefly.iot.support.service.AsyncTaskFileService;
import com.songhg.firefly.iot.support.service.AsyncTaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

@Tag(name = "异步任务中心", description = "异步任务管理（导出、导入、同步等）")
@RestController
@RequestMapping("/api/v1/async-tasks")
@RequiredArgsConstructor
@RequiresLogin
public class AsyncTaskController {

    private final AsyncTaskService asyncTaskService;
    private final AsyncTaskFileService asyncTaskFileService;

    @Operation(summary = "创建异步任务")
    @PostMapping
    @RequiresPermission("export:create")
    public R<AsyncTaskVO> createTask(@Valid @RequestBody AsyncTaskCreateDTO dto) {
        AsyncTask task = asyncTaskService.createTask(
                dto.getTaskName(), dto.getTaskType(), dto.getBizType(), dto.getFileFormat(), dto.getExtraData());
        return R.ok(AsyncTaskConvert.INSTANCE.toVO(task));
    }

    @Operation(summary = "分页查询异步任务")
    @PostMapping("/list")
    @RequiresPermission("export:read")
    public R<IPage<AsyncTaskVO>> listTasks(@RequestBody AsyncTaskQueryDTO query) {
        return R.ok(asyncTaskService.listTasks(query).convert(AsyncTaskConvert.INSTANCE::toVO));
    }

    @Operation(summary = "查询我的异步任务")
    @PostMapping("/mine/list")
    public R<IPage<AsyncTaskVO>> listMyTasks(@RequestBody AsyncTaskQueryDTO query) {
        return R.ok(asyncTaskService.listMyTasks(query).convert(AsyncTaskConvert.INSTANCE::toVO));
    }

    @Operation(summary = "获取任务详情")
    @GetMapping("/{id}")
    @RequiresPermission("export:read")
    public R<AsyncTaskVO> getTask(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        return R.ok(AsyncTaskConvert.INSTANCE.toVO(asyncTaskService.getTask(id)));
    }

    @Operation(summary = "下载任务结果文件")
    @GetMapping("/{id}/download")
    @RequiresPermission("export:read")
    public ResponseEntity<Resource> download(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        AsyncTask task = asyncTaskService.getTask(id);
        if (task.getResultUrl() == null) {
            return ResponseEntity.notFound().build();
        }
        if (!"COMPLETED".equals(task.getStatus()) && !"FAILED".equals(task.getStatus())) {
            return ResponseEntity.notFound().build();
        }

        if (asyncTaskFileService.isLocalFile(task.getResultUrl())) {
            Path localPath = Path.of(task.getResultUrl());
            String suffix = task.getFileFormat() != null ? "." + task.getFileFormat().toLowerCase() : "";
            String encodedName = URLEncoder.encode(task.getTaskName() + suffix, StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(localPath.toFile().length())
                    .body(new FileSystemResource(localPath));
        }

        // 跨服务导出结果存储在 MinIO 中，这里返回预签名地址，让前端继续沿用统一下载入口。
        String downloadUrl = asyncTaskFileService.getDownloadUrl(task.getResultUrl());
        if (downloadUrl == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(downloadUrl))
                .build();
    }

    @Operation(summary = "取消任务")
    @PutMapping("/{id}/cancel")
    @RequiresPermission("export:update")
    public R<Void> cancelTask(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        asyncTaskService.cancelTask(id);
        return R.ok();
    }

    @Operation(summary = "更新任务进度")
    @PutMapping("/{id}/progress")
    public R<Void> updateProgress(@Parameter(description = "任务编号", required = true) @PathVariable Long id,
                                  @Parameter(description = "进度(0-100)", required = true) @RequestParam Integer progress) {
        asyncTaskService.updateProgress(id, progress);
        return R.ok();
    }

    @Operation(summary = "完成任务")
    @PutMapping("/{id}/complete")
    public R<Void> completeTask(@Parameter(description = "任务编号", required = true) @PathVariable Long id,
                                @RequestParam(value = "success", defaultValue = "true") Boolean success,
                                @RequestParam(value = "resultUrl", required = false) String resultUrl,
                                @RequestParam(value = "resultSize", required = false) Long resultSize,
                                @RequestParam(value = "totalRows", required = false) Integer totalRows,
                                @RequestParam(value = "errorMessage", required = false) String errorMessage) {
        asyncTaskService.completeTask(id, success, resultUrl, resultSize, totalRows, errorMessage);
        return R.ok();
    }

    @Operation(summary = "标记任务失败")
    @PutMapping("/{id}/fail")
    public R<Void> failTask(@Parameter(description = "任务编号", required = true) @PathVariable Long id,
                            @Parameter(description = "错误信息", required = true) @RequestParam String errorMessage) {
        asyncTaskService.completeTask(id, false, null, null, null, errorMessage);
        return R.ok();
    }

    @Operation(summary = "删除任务")
    @DeleteMapping("/{id}")
    @RequiresPermission("export:delete")
    public R<Void> deleteTask(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        asyncTaskService.deleteTask(id);
        return R.ok();
    }

    @Operation(summary = "清理过期任务")
    @PostMapping("/clean")
    @RequiresPermission("export:delete")
    public R<Integer> cleanExpired() {
        return R.ok(asyncTaskService.cleanExpiredTasks());
    }
}
