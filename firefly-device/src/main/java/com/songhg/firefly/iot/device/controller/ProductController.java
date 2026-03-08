package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.product.ProductCreateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductQueryDTO;
import com.songhg.firefly.iot.device.dto.product.ProductUpdateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductVO;
import com.songhg.firefly.iot.device.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@Tag(name = "产品管理", description = "产品 CRUD")
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @PostMapping
    @RequiresPermission("product:create")
    @Operation(summary = "创建产品")
    public R<ProductVO> createProduct(@Valid @RequestBody ProductCreateDTO dto) {
        return R.ok(productService.createProduct(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("product:read")
    @Operation(summary = "分页查询产品")
    public R<IPage<ProductVO>> listProducts(@RequestBody ProductQueryDTO query) {
        return R.ok(productService.listProducts(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("product:read")
    @Operation(summary = "获取产品详情")
    public R<ProductVO> getProduct(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id) {
        return R.ok(productService.getProductById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("product:update")
    @Operation(summary = "更新产品")
    public R<ProductVO> updateProduct(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id,
            @Valid @RequestBody ProductUpdateDTO dto) {
        return R.ok(productService.updateProduct(id, dto));
    }

    @PostMapping("/upload-image")
    @RequiresPermission(value = {"product:create", "product:update"}, logical = RequiresPermission.Logical.OR)
    @Operation(summary = "上传产品图片")
    public R<Map<String, String>> uploadProductImage(
            @Parameter(description = "产品图片文件", required = true)
            @RequestParam("file") MultipartFile file) {
        return R.ok(productService.uploadProductImage(file));
    }

    @PutMapping("/{id}/publish")
    @RequiresPermission("product:publish")
    @Operation(summary = "发布产品")
    public R<Void> publishProduct(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id) {
        productService.publishProduct(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("product:delete")
    @Operation(summary = "删除产品")
    public R<Void> deleteProduct(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id) {
        productService.deleteProduct(id);
        return R.ok();
    }

    @PutMapping("/{id}/thing-model")
    @RequiresPermission("product:update")
    @Operation(summary = "更新物模型")
    public R<ProductVO> updateThingModel(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id,
            @RequestBody String thingModelJson) {
        return R.ok(productService.updateThingModel(id, thingModelJson));
    }

    @GetMapping("/{id}/thing-model")
    @RequiresPermission("product:read")
    @Operation(summary = "获取物模型")
    public R<String> getThingModel(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id) {
        return R.ok(productService.getThingModel(id));
    }

    @GetMapping("/{id}/secret")
    @RequiresPermission("product:read")
    @Operation(summary = "获取产品密钥")
    public R<String> getProductSecret(
            @Parameter(description = "产品编号", required = true) @PathVariable Long id) {
        return R.ok(productService.getProductSecret(id));
    }
}
