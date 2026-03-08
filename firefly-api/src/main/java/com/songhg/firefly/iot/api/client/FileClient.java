package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

/**
 * 文件服务 Feign Client（供其他微服务调用 support 服务上传文件）
 */
@FeignClient(name = "firefly-support", contextId = "fileClient", path = "/api/v1/files")
public interface FileClient {

    @PostMapping("/upload/bytes")
    R<Map<String, String>> uploadBytes(@RequestParam("objectName") String objectName,
                                        @RequestParam("contentType") String contentType,
                                        @RequestBody byte[] data);
}
