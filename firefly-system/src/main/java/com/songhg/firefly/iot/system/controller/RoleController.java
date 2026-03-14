package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.role.RoleCreateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleOptionVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionGroupVO;
import com.songhg.firefly.iot.system.dto.role.RoleQueryDTO;
import com.songhg.firefly.iot.system.dto.role.RoleUpdateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleVO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.service.RoleService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "角色管理", description = "角色 CRUD、权限目录与角色成员查询")
@RestController
@RequestMapping("/api/v1/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @PostMapping
    @RequiresPermission("role:create")
    @Operation(summary = "创建角色")
    public R<RoleVO> createRole(@Valid @RequestBody RoleCreateDTO dto) {
        return R.ok(roleService.createRole(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("role:read")
    @Operation(summary = "分页查询角色")
    public R<IPage<RoleVO>> listRoles(@RequestBody RoleQueryDTO query) {
        return R.ok(roleService.listRoles(query));
    }

    @GetMapping("/options")
    @RequiresPermission(
            value = {"role:read", "user:create", "user:update", "user:role:assign"},
            logical = RequiresPermission.Logical.OR
    )
    @Operation(summary = "查询可分配角色选项")
    public R<List<RoleOptionVO>> listRoleOptions() {
        return R.ok(roleService.listAssignableRoles());
    }

    @GetMapping("/permission-groups")
    @RequiresPermission(
            value = {"role:read", "role:create", "role:update"},
            logical = RequiresPermission.Logical.OR
    )
    @Operation(summary = "查询当前空间可分配权限目录")
    public R<List<RolePermissionGroupVO>> listAssignablePermissionGroups() {
        return R.ok(roleService.listAssignablePermissionGroups());
    }

    @GetMapping("/{id}")
    @RequiresPermission("role:read")
    @Operation(summary = "获取角色详情")
    public R<RoleVO> getRole(@Parameter(description = "角色 ID", required = true) @PathVariable Long id) {
        return R.ok(roleService.getRoleById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("role:update")
    @Operation(summary = "更新角色")
    public R<RoleVO> updateRole(
            @Parameter(description = "角色 ID", required = true) @PathVariable Long id,
            @Valid @RequestBody RoleUpdateDTO dto) {
        return R.ok(roleService.updateRole(id, dto));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("role:delete")
    @Operation(summary = "删除角色")
    public R<Void> deleteRole(@Parameter(description = "角色 ID", required = true) @PathVariable Long id) {
        roleService.deleteRole(id);
        return R.ok();
    }

    @GetMapping("/{id}/users")
    @RequiresPermission("role:read")
    @Operation(summary = "查询角色下的用户")
    public R<List<UserVO>> listUsersByRole(
            @Parameter(description = "角色 ID", required = true) @PathVariable Long id) {
        return R.ok(roleService.listUsersByRoleId(id));
    }
}
