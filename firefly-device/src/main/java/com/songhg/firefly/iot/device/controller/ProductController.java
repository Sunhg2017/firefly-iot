package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.openapi.OpenApi;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.product.ProductCreateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductQueryDTO;
import com.songhg.firefly.iot.device.dto.product.ProductUpdateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductVO;
import com.songhg.firefly.iot.device.dto.product.ThingModelImportDTO;
import com.songhg.firefly.iot.device.service.ProductService;
import com.songhg.firefly.iot.device.service.ThingModelImportService;
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

@Tag(name = "Product Management", description = "Product CRUD APIs")
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final ThingModelImportService thingModelImportService;

    @PostMapping
    @RequiresPermission("product:create")
    @Operation(summary = "Create product")
    public R<ProductVO> createProduct(@Valid @RequestBody ProductCreateDTO dto) {
        return R.ok(productService.createProduct(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("product:read")
    @Operation(summary = "List products")
    public R<IPage<ProductVO>> listProducts(@RequestBody ProductQueryDTO query) {
        return R.ok(productService.listProducts(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("product:read")
    @Operation(summary = "Get product detail")
    public R<ProductVO> getProduct(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id) {
        return R.ok(productService.getProductById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("product:update")
    @Operation(summary = "Update product")
    public R<ProductVO> updateProduct(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id,
            @Valid @RequestBody ProductUpdateDTO dto) {
        return R.ok(productService.updateProduct(id, dto));
    }

    @PostMapping("/upload-image")
    @RequiresPermission(value = {"product:create", "product:update"}, logical = RequiresPermission.Logical.OR)
    @Operation(summary = "Upload product image")
    public R<Map<String, String>> uploadProductImage(
            @Parameter(description = "Product image file", required = true)
            @RequestParam("file") MultipartFile file) {
        return R.ok(productService.uploadProductImage(file));
    }

    @PutMapping("/{id}/publish")
    @RequiresPermission("product:publish")
    @Operation(summary = "Publish product")
    public R<Void> publishProduct(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id) {
        productService.publishProduct(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("product:delete")
    @Operation(summary = "Delete product")
    public R<Void> deleteProduct(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id) {
        productService.deleteProduct(id);
        return R.ok();
    }

    @PutMapping("/{id}/thing-model")
    @RequiresPermission("product:update")
    @Operation(summary = "Update thing model")
    public R<ProductVO> updateThingModel(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id,
            @RequestBody String thingModelJson) {
        return R.ok(productService.updateThingModel(id, thingModelJson));
    }

    @GetMapping("/{id}/thing-model")
    @RequiresPermission("product:read")
    @Operation(summary = "Get thing model")
    public R<String> getThingModel(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id) {
        return R.ok(productService.getThingModel(id));
    }

    @GetMapping("/thing-model/by-product-key")
    @RequiresPermission("product:read")
    @OpenApi(
            code = "product.thing-model.by-product-key",
            name = "按 ProductKey 获取产品物模型",
            description = "通过业务唯一键 ProductKey 读取当前租户下的产品物模型"
    )
    @Operation(summary = "按 ProductKey 获取产品物模型")
    public R<String> getThingModelByProductKey(
            @Parameter(description = "产品 ProductKey", required = true) @RequestParam String productKey) {
        return R.ok(productService.getThingModelByProductKeyForCurrentTenant(productKey));
    }

    @GetMapping("/{id}/secret")
    @RequiresPermission("product:read")
    @Operation(summary = "Get product secret")
    public R<String> getProductSecret(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id) {
        return R.ok(productService.getProductSecret(id));
    }

    @PostMapping("/{id}/thing-model/import")
    @RequiresPermission("product:update")
    @Operation(summary = "Register async thing model import", description = "Upload the source file to MinIO first and then register the import task with fileKey")
    public R<Long> importThingModel(
            @Parameter(description = "Product ID", required = true) @PathVariable Long id,
            @Valid @RequestBody ThingModelImportDTO dto) {
        Long taskId = thingModelImportService.registerImportTask(id, dto);
        return R.ok(taskId);
    }
}
