package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal product read APIs for service-to-service calls.
 */
@Tag(name = "内部产品接口", description = "供其他微服务读取产品基础数据")
@RestController
@RequestMapping("/api/v1/internal/products")
@RequiredArgsConstructor
public class InternalProductController {

    private final ProductService productService;

    @GetMapping("/{id}/basic")
    @Operation(summary = "获取产品基础信息")
    public R<ProductBasicVO> getProductBasic(@PathVariable Long id) {
        return R.ok(productService.getProductBasic(id));
    }

    @GetMapping("/basic/by-product-key")
    @Operation(summary = "按 ProductKey 获取产品基础信息")
    public R<ProductBasicVO> getProductBasicByProductKey(@RequestParam("productKey") String productKey) {
        return R.ok(productService.getProductBasicByProductKey(productKey));
    }

    @GetMapping("/thing-model")
    @Operation(summary = "按 ProductKey 获取产品物模型")
    public R<String> getThingModelByProductKey(@RequestParam("productKey") String productKey) {
        return R.ok(productService.getThingModelByProductKey(productKey));
    }
}
