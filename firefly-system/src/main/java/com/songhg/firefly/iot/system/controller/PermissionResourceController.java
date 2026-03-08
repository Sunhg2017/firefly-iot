package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.convert.PermissionResourceConvert;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceCreateDTO;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceUpdateDTO;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceVO;
import com.songhg.firefly.iot.system.dto.permission.RolePermissionAssignDTO;
import com.songhg.firefly.iot.system.entity.PermissionResource;
import com.songhg.firefly.iot.system.service.PermissionResourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "权限资源", description = "权限资源 CRUD")
@RestController
@RequestMapping("/api/v1/permission-resources")
@RequiredArgsConstructor
public class PermissionResourceController {

    private final PermissionResourceService resourceService;

    @PostMapping
    @RequiresPermission("permission:create")
    @Operation(summary = "创建权限资源")
    public R<PermissionResourceVO> create(@Valid @RequestBody PermissionResourceCreateDTO dto) {
        PermissionResource resource = PermissionResourceConvert.INSTANCE.toEntity(dto);
        return R.ok(PermissionResourceConvert.INSTANCE.toVO(resourceService.create(resource)));
    }

    @GetMapping("/{id}")
    @RequiresPermission("permission:read")
    @Operation(summary = "获取权限资源详情")
    public R<PermissionResourceVO> getById(@Parameter(description = "资源编号", required = true) @PathVariable Long id) {
        return R.ok(PermissionResourceConvert.INSTANCE.toVO(resourceService.getById(id)));
    }

    @GetMapping
    @RequiresPermission("permission:read")
    @Operation(summary = "查询全部权限资源")
    public R<List<PermissionResourceVO>> listAll() {
        return R.ok(resourceService.listAll().stream().map(PermissionResourceConvert.INSTANCE::toVO).toList());
    }

    @Operation(summary = "获取权限资源树")
    @GetMapping("/tree")
    @RequiresPermission("permission:read")
    public R<List<Map<String, Object>>> getTree() {
        return R.ok(resourceService.getTree());
    }

    @Operation(summary = "按类型查询权限资源")
    @GetMapping("/by-type")
    @RequiresPermission("permission:read")
    public R<List<PermissionResourceVO>> listByType(@Parameter(description = "资源类型", required = true) @RequestParam String type) {
        return R.ok(resourceService.listByType(type).stream().map(PermissionResourceConvert.INSTANCE::toVO).toList());
    }

    @PutMapping("/{id}")
    @RequiresPermission("permission:update")
    @Operation(summary = "更新权限资源")
    public R<PermissionResourceVO> update(@Parameter(description = "资源编号", required = true) @PathVariable Long id, @Valid @RequestBody PermissionResourceUpdateDTO dto) {
        PermissionResource resource = resourceService.getById(id);
        PermissionResourceConvert.INSTANCE.updateEntity(dto, resource);
        return R.ok(PermissionResourceConvert.INSTANCE.toVO(resourceService.update(id, resource)));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("permission:delete")
    @Operation(summary = "删除权限资源")
    public R<Void> delete(@Parameter(description = "资源编号", required = true) @PathVariable Long id) {
        resourceService.delete(id);
        return R.ok();
    }

    @Operation(summary = "获取角色权限列表")
    @GetMapping("/role/{roleId}")
    @RequiresPermission("permission:read")
    public R<List<String>> getRolePermissions(@Parameter(description = "角色编号", required = true) @PathVariable Long roleId) {
        return R.ok(resourceService.getRolePermissions(roleId));
    }

    @Operation(summary = "分配角色权限")
    @PutMapping("/role/{roleId}")
    @RequiresPermission("permission:update")
    public R<Void> assignRolePermissions(@Parameter(description = "角色编号", required = true) @PathVariable Long roleId, @Valid @RequestBody RolePermissionAssignDTO dto) {
        resourceService.assignRolePermissions(roleId, dto.getPermissions());
        return R.ok();
    }
}
