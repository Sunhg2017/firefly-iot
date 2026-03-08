package com.songhg.firefly.iot.support.service;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.config.MinioProperties;
import io.minio.*;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class MinioService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;

    @PostConstruct
    public void init() {
        try {
            boolean exists = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(minioProperties.getBucket()).build());
            if (!exists) {
                minioClient.makeBucket(
                        MakeBucketArgs.builder().bucket(minioProperties.getBucket()).build());
                log.info("MinIO bucket created: {}", minioProperties.getBucket());
            }
        } catch (Exception e) {
            log.warn("MinIO bucket init failed (will retry on first upload): {}", e.getMessage());
        }
    }

    /**
     * 上传文件
     *
     * @param objectName 对象路径 (如 "tenantId/deviceId/snapshot_xxx.jpg")
     * @param data       文件字节数组
     * @param contentType MIME 类型
     * @return 文件的公开访问 URL
     */
    public String upload(String objectName, byte[] data, String contentType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .stream(new ByteArrayInputStream(data), data.length, -1)
                    .contentType(contentType)
                    .build());
            log.debug("MinIO uploaded: bucket={}, object={}, size={}", minioProperties.getBucket(), objectName, data.length);
            return getObjectUrl(objectName);
        } catch (Exception e) {
            log.error("MinIO upload failed: object={}, error={}", objectName, e.getMessage());
            throw new BizException(ResultCode.INTERNAL_ERROR, "文件上传失败: " + e.getMessage());
        }
    }

    /**
     * 上传 MultipartFile
     */
    public String upload(String objectName, MultipartFile file) {
        try (InputStream is = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .stream(is, file.getSize(), -1)
                    .contentType(file.getContentType())
                    .build());
            log.debug("MinIO uploaded: bucket={}, object={}, size={}", minioProperties.getBucket(), objectName, file.getSize());
            return getObjectUrl(objectName);
        } catch (Exception e) {
            log.error("MinIO upload failed: object={}, error={}", objectName, e.getMessage());
            throw new BizException(ResultCode.INTERNAL_ERROR, "文件上传失败: " + e.getMessage());
        }
    }

    /**
     * 上传 InputStream
     */
    public String upload(String objectName, InputStream inputStream, long size, String contentType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .stream(inputStream, size, -1)
                    .contentType(contentType)
                    .build());
            log.debug("MinIO uploaded: bucket={}, object={}, size={}", minioProperties.getBucket(), objectName, size);
            return getObjectUrl(objectName);
        } catch (Exception e) {
            log.error("MinIO upload failed: object={}, error={}", objectName, e.getMessage());
            throw new BizException(ResultCode.INTERNAL_ERROR, "文件上传失败: " + e.getMessage());
        }
    }

    /**
     * 获取文件的预签名 URL (有效期 7 天)
     */
    public String getPresignedUrl(String objectName) {
        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .expiry(7, TimeUnit.DAYS)
                    .build());
        } catch (Exception e) {
            log.error("MinIO getPresignedUrl failed: object={}, error={}", objectName, e.getMessage());
            throw new BizException(ResultCode.INTERNAL_ERROR, "获取文件URL失败: " + e.getMessage());
        }
    }

    /**
     * 获取对象的直接访问 URL (需要 bucket 设置为公开读或通过 Nginx 代理)
     */
    public String getObjectUrl(String objectName) {
        return minioProperties.getEndpoint() + "/" + minioProperties.getBucket() + "/" + objectName;
    }

    /**
     * 删除文件
     */
    public void delete(String objectName) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .build());
            log.debug("MinIO deleted: bucket={}, object={}", minioProperties.getBucket(), objectName);
        } catch (Exception e) {
            log.error("MinIO delete failed: object={}, error={}", objectName, e.getMessage());
        }
    }

    /**
     * 检查文件是否存在
     */
    public boolean exists(String objectName) {
        try {
            minioClient.statObject(StatObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectName)
                    .build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
