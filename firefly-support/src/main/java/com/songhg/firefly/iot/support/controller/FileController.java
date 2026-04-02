package com.songhg.firefly.iot.support.controller;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.service.MinioService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.util.DigestUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Tag(name = "文件管理", description = "文件上传与下载")
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final MinioService minioService;

    /**
     * 通用文件上传
     * 返回文件访问 URL
     */
    @Operation(summary = "通用文件上传")
    @PostMapping("/upload")
    @RequiresPermission("file:upload")
    public R<Map<String, String>> upload(@Parameter(description = "待上传文件") @RequestParam("file") MultipartFile file,
                                          @Parameter(description = "目录") @RequestParam(value = "dir", required = false, defaultValue = "general") String dir) {
        Long tenantId = AppContextHolder.getTenantId();
        String originalName = file.getOriginalFilename();
        String ext = "";
        if (originalName != null && originalName.contains(".")) {
            ext = originalName.substring(originalName.lastIndexOf("."));
        }
        String objectName = tenantId + "/" + dir + "/" + UUID.randomUUID().toString().replace("-", "") + ext;
        String url = minioService.upload(objectName, file);
        return R.ok(Map.of("url", url, "objectName", objectName, "originalName", originalName != null ? originalName : ""));
    }

    /**
     * 固件文件上传 (OTA 专用)
     */
    @Operation(summary = "固件文件上传")
    @PostMapping("/upload/firmware")
    @RequiresPermission("ota:upload")
    public R<Map<String, String>> uploadFirmware(@Parameter(description = "固件文件") @RequestParam("file") MultipartFile file) throws IOException {
        Long tenantId = AppContextHolder.getTenantId();
        String originalName = file.getOriginalFilename();
        String ext = "";
        if (originalName != null && originalName.contains(".")) {
            ext = originalName.substring(originalName.lastIndexOf("."));
        }
        String objectName = tenantId + "/firmware/" + UUID.randomUUID().toString().replace("-", "") + ext;
        String url = minioService.upload(objectName, file);
        String md5Checksum = DigestUtils.md5DigestAsHex(file.getInputStream());
        return R.ok(Map.of("url", url, "objectName", objectName, "originalName", originalName != null ? originalName : "",
                "fileSize", String.valueOf(file.getSize()), "md5Checksum", md5Checksum));
    }

    /**
     * 上传字节数组 (供内部 Feign 调用)
     */
    @Operation(summary = "上传字节数据（内部 Feign）")
    @PostMapping("/upload/bytes")
    public R<Map<String, String>> uploadBytes(@Parameter(description = "对象名称") @RequestParam("objectName") String objectName,
                                               @Parameter(description = "内容类型") @RequestParam("contentType") String contentType,
                                               @RequestBody byte[] data) {
        String url = minioService.upload(objectName, data, contentType);
        return R.ok(Map.of("url", url, "objectName", objectName));
    }

    /**
     * 获取文件预签名 URL (适用于私有 bucket)
     */
    @Operation(summary = "获取预签名 URL")
    @GetMapping("/presigned")
    @RequiresPermission("file:read")
    public R<Map<String, String>> getPresignedUrl(@Parameter(description = "对象名称", required = true) @RequestParam("objectName") String objectName) {
        String url = minioService.getPresignedUrl(objectName);
        return R.ok(Map.of("url", url));
    }

    /**
     * 删除文件
     */
    @DeleteMapping
    @RequiresPermission("file:delete")
    @Operation(summary = "删除文件")
    public R<Void> delete(@Parameter(description = "对象名称", required = true) @RequestParam("objectName") String objectName) {
        minioService.delete(objectName);
        return R.ok();
    }
}
