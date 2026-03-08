package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.convert.PermissionResourceConvert;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceVO;
import com.songhg.firefly.iot.system.service.PermissionResourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Tag(name = "权限管理", description = "权限资源列表、权限分组树")
@RestController
@RequestMapping("/api/v1/permissions")
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionResourceService resourceService;

    @GetMapping
    @RequiresPermission("role:read")
    @Operation(summary = "获取全部权限资源")
    public R<List<PermissionResourceVO>> listAll() {
        return R.ok(resourceService.listAll().stream()
                .map(PermissionResourceConvert.INSTANCE::toVO).toList());
    }

    @Operation(summary = "获取权限分组树")
    @GetMapping("/groups")
    @RequiresPermission("role:read")
    public R<List<Map<String, Object>>> listGroups() {
        return R.ok(resourceService.getTree());
    }
}
