package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.enums.ProjectStatus;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.convert.ProjectConvert;
import com.songhg.firefly.iot.system.dto.project.ProjectCreateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectDeviceVO;
import com.songhg.firefly.iot.system.dto.project.ProjectMemberVO;
import com.songhg.firefly.iot.system.dto.project.ProjectQueryDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectUpdateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectVO;
import com.songhg.firefly.iot.system.service.ProjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "项目管理", description = "项目 CRUD、成员管理、设备绑定")
@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @PostMapping
    @RequiresPermission("project:create")
    @Operation(summary = "创建项目")
    public R<ProjectVO> createProject(@Valid @RequestBody ProjectCreateDTO dto) {
        return R.ok(projectService.createProject(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("project:read")
    @Operation(summary = "分页查询项目")
    public R<IPage<ProjectVO>> listProjects(@RequestBody ProjectQueryDTO query) {
        return R.ok(projectService.listProjects(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("project:read")
    @Operation(summary = "获取项目详情")
    public R<ProjectVO> getProject(@Parameter(description = "项目编号", required = true) @PathVariable Long id) {
        return R.ok(projectService.getProjectById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("project:update")
    @Operation(summary = "更新项目")
    public R<ProjectVO> updateProject(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Valid @RequestBody ProjectUpdateDTO dto) {
        return R.ok(projectService.updateProject(id, dto));
    }

    @PutMapping("/{id}/status")
    @RequiresPermission("project:update")
    @Operation(summary = "更新项目状态")
    public R<Void> updateProjectStatus(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "新状态") @RequestParam ProjectStatus status) {
        projectService.updateProjectStatus(id, status);
        return R.ok();
    }

    // ==================== Members ====================

    @GetMapping("/{id}/members")
    @RequiresPermission("project:read")
    @Operation(summary = "查询项目成员")
    public R<List<ProjectMemberVO>> listMembers(@Parameter(description = "项目编号", required = true) @PathVariable Long id) {
        return R.ok(projectService.listMembers(id).stream()
                .map(ProjectConvert.INSTANCE::toMemberVO).toList());
    }

    @PostMapping("/{id}/members")
    @RequiresPermission("project:update")
    @Operation(summary = "添加成员")
    public R<Void> addMember(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "用户编号") @RequestParam Long userId, @Parameter(description = "成员角色") @RequestParam(defaultValue = "MEMBER") String role) {
        projectService.addMember(id, userId, role);
        return R.ok();
    }

    @DeleteMapping("/{id}/members/{userId}")
    @RequiresPermission("project:update")
    @Operation(summary = "移除成员")
    public R<Void> removeMember(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "用户编号", required = true) @PathVariable Long userId) {
        projectService.removeMember(id, userId);
        return R.ok();
    }

    @PutMapping("/{id}/members/{userId}/role")
    @RequiresPermission("project:update")
    @Operation(summary = "更新成员角色")
    public R<Void> updateMemberRole(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "用户编号", required = true) @PathVariable Long userId, @Parameter(description = "新角色") @RequestParam String role) {
        projectService.updateMemberRole(id, userId, role);
        return R.ok();
    }

    // ==================== Devices ====================

    @GetMapping("/{id}/devices")
    @RequiresPermission("project:read")
    @Operation(summary = "查询项目设备")
    public R<List<ProjectDeviceVO>> listDevices(@Parameter(description = "项目编号", required = true) @PathVariable Long id) {
        return R.ok(projectService.listDevices(id).stream()
                .map(ProjectConvert.INSTANCE::toDeviceVO).toList());
    }

    @PostMapping("/{id}/devices")
    @RequiresPermission("project:update")
    @Operation(summary = "绑定设备")
    public R<Void> bindDevice(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "设备编号") @RequestParam Long deviceId) {
        projectService.bindDevice(id, deviceId);
        return R.ok();
    }

    @DeleteMapping("/{id}/devices/{deviceId}")
    @RequiresPermission("project:update")
    @Operation(summary = "解绑设备")
    public R<Void> unbindDevice(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        projectService.unbindDevice(id, deviceId);
        return R.ok();
    }

    @PostMapping("/{id}/devices/batch")
    @RequiresPermission("project:update")
    @Operation(summary = "批量绑定设备")
    public R<Void> batchBindDevices(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @RequestBody List<Long> deviceIds) {
        projectService.batchBindDevices(id, deviceIds);
        return R.ok();
    }

    @DeleteMapping("/{id}/devices/batch")
    @RequiresPermission("project:update")
    @Operation(summary = "批量解绑设备")
    public R<Void> batchUnbindDevices(@Parameter(description = "项目编号", required = true) @PathVariable Long id, @RequestBody List<Long> deviceIds) {
        projectService.batchUnbindDevices(id, deviceIds);
        return R.ok();
    }
}
