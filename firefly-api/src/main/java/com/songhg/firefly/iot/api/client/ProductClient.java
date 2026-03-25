package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 产品服务 Feign Client（供其他微服务调用）
 */
@FeignClient(name = "firefly-device", contextId = "productClient", path = "/api/v1/internal/products")
public interface ProductClient {

    @GetMapping("/{id}/basic")
    R<ProductBasicVO> getProductBasic(@PathVariable("id") Long id);

    @GetMapping("/basic/by-product-key")
    R<ProductBasicVO> getProductBasicByProductKey(@RequestParam("productKey") String productKey);

    @GetMapping("/thing-model")
    R<String> getThingModelByProductKey(@RequestParam("productKey") String productKey);
}
