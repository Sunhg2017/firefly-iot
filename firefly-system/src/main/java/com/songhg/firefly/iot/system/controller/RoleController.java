package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.role.RoleCreateDTO;
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
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "角色管理", description = "角色 CRUD、角色下用户查询")
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

    @GetMapping("/{id}")
    @RequiresPermission("role:read")
    @Operation(summary = "获取角色详情")
    public R<RoleVO> getRole(@Parameter(description = "角色编号", required = true) @PathVariable Long id) {
        return R.ok(roleService.getRoleById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("role:update")
    @Operation(summary = "更新角色")
    public R<RoleVO> updateRole(@Parameter(description = "角色编号", required = true) @PathVariable Long id, @Valid @RequestBody RoleUpdateDTO dto) {
        return R.ok(roleService.updateRole(id, dto));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("role:delete")
    @Operation(summary = "删除角色")
    public R<Void> deleteRole(@Parameter(description = "角色编号", required = true) @PathVariable Long id) {
        roleService.deleteRole(id);
        return R.ok();
    }

    @GetMapping("/{id}/users")
    @RequiresPermission("role:read")
    @Operation(summary = "查询角色下用户")
    public R<List<UserVO>> listUsersByRole(@Parameter(description = "角色编号", required = true) @PathVariable Long id) {
        return R.ok(roleService.listUsersByRoleId(id));
    }
}
