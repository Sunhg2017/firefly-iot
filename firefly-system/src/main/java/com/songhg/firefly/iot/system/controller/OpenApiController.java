package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiQueryDTO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiVO;
import com.songhg.firefly.iot.system.service.OpenApiCatalogService;
import com.songhg.firefly.iot.system.service.UserDomainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "OpenAPI Management", description = "Platform OpenAPI catalog management")
@RestController
@RequestMapping("/api/v1/platform/open-apis")
@RequiredArgsConstructor
public class OpenApiController {

    private final OpenApiCatalogService openApiCatalogService;
    private final UserDomainService userDomainService;

    @PostMapping("/list")
    @RequiresPermission("openapi:read")
    @Operation(summary = "Page query OpenAPI catalog")
    public R<IPage<OpenApiVO>> list(@RequestBody OpenApiQueryDTO query) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(openApiCatalogService.listOpenApis(query));
    }

    @GetMapping("/{code}")
    @RequiresPermission("openapi:read")
    @Operation(summary = "Get OpenAPI detail")
    public R<OpenApiVO> get(@Parameter(description = "OpenAPI code", required = true) @PathVariable String code) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(openApiCatalogService.getOpenApi(code));
    }

    @GetMapping("/options")
    @RequiresPermission("openapi:read")
    @Operation(summary = "List OpenAPI options")
    public R<List<OpenApiOptionVO>> listOptions() {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(openApiCatalogService.listAllOptions());
    }
}
