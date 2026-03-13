package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.user.*;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.system.service.PermissionService;
import com.songhg.firefly.iot.system.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@Tag(name = "用户管理", description = "用户 CRUD、角色分配、密码管理")
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final PermissionService permissionService;

    // ==================== Current User (/me) ====================

    @RequiresLogin
    @GetMapping("/me")
    @Operation(summary = "获取当前用户信息")
    public R<UserVO> getCurrentUser() {
        Long userId = AppContextHolder.getUserId();
        return R.ok(userService.getUserById(userId));
    }

    @RequiresLogin
    @PutMapping("/me")
    @Operation(summary = "更新当前用户信息")
    public R<UserVO> updateCurrentUser(@Valid @RequestBody UserUpdateDTO dto) {
        Long userId = AppContextHolder.getUserId();
        return R.ok(userService.updateUser(userId, dto));
    }

    @RequiresLogin
    @PutMapping("/me/password")
    @Operation(summary = "修改密码")
    public R<Void> changePassword(@Valid @RequestBody ChangePasswordDTO dto) {
        Long userId = AppContextHolder.getUserId();
        userService.changePassword(userId, dto.getOldPassword(), dto.getNewPassword());
        return R.ok();
    }

    @RequiresLogin
    @GetMapping("/me/permissions")
    @Operation(summary = "获取我的权限列表")
    public R<Set<String>> getMyPermissions() {
        Long userId = AppContextHolder.getUserId();
        return R.ok(permissionService.getUserPermissions(userId));
    }

    // ==================== User Management ====================

    @PostMapping
    @RequiresPermission("user:create")
    @Operation(summary = "创建用户")
    public R<UserVO> createUser(@Valid @RequestBody UserCreateDTO dto) {
        return R.ok(userService.createUser(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("user:read")
    @Operation(summary = "分页查询用户列表")
    public R<IPage<UserVO>> listUsers(@RequestBody UserQueryDTO query) {
        return R.ok(userService.listUsers(query));
    }

    @GetMapping("/options")
    @RequiresPermission(
        value = {"user:read", "alarm:read", "alarm:update"},
        logical = RequiresPermission.Logical.OR
    )
    @Operation(summary = "List selectable users")
    public R<List<UserOptionVO>> listUserOptions() {
        return R.ok(userService.listSelectableUsers());
    }

    @GetMapping("/{id}")
    @RequiresPermission("user:read")
    @Operation(summary = "获取用户详情")
    public R<UserVO> getUser(@Parameter(description = "用户编号", required = true) @PathVariable Long id) {
        return R.ok(userService.getUserById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("user:update")
    @Operation(summary = "更新用户")
    public R<UserVO> updateUser(@Parameter(description = "用户编号", required = true) @PathVariable Long id, @Valid @RequestBody UserUpdateDTO dto) {
        return R.ok(userService.updateUser(id, dto));
    }

    @PutMapping("/{id}/status")
    @RequiresPermission("user:update")
    @Operation(summary = "更新用户状态")
    public R<Void> updateUserStatus(@Parameter(description = "用户编号", required = true) @PathVariable Long id, @Parameter(description = "新状态") @RequestParam UserStatus status) {
        userService.updateUserStatus(id, status);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("user:delete")
    @Operation(summary = "删除用户")
    public R<Void> deleteUser(@Parameter(description = "用户编号", required = true) @PathVariable Long id) {
        userService.deleteUser(id);
        return R.ok();
    }

    @PutMapping("/{id}/roles")
    @RequiresPermission("user:role:assign")
    @Operation(summary = "分配角色")
    public R<Void> assignRoles(@Parameter(description = "用户编号", required = true) @PathVariable Long id, @RequestBody List<UserCreateDTO.UserRoleDTO> roles) {
        userService.assignRoles(id, roles);
        return R.ok();
    }

    @GetMapping("/{id}/roles")
    @RequiresPermission("user:read")
    @Operation(summary = "获取用户角色列表")
    public R<List<UserCreateDTO.UserRoleDTO>> getUserRoles(@Parameter(description = "用户编号", required = true) @PathVariable Long id) {
        return R.ok(userService.getUserRoles(id));
    }

    @PostMapping("/{id}/reset-password")
    @RequiresPermission("user:update")
    @Operation(summary = "重置密码")
    public R<Void> resetPassword(@Parameter(description = "用户编号", required = true) @PathVariable Long id, @RequestBody String newPassword) {
        userService.resetPassword(id, newPassword);
        return R.ok();
    }
}
