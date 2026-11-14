package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigAssignmentVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigCreateDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigDeployDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigDeployResultVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigQueryDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigRollbackDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigUpdateDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigVersionVO;
import com.songhg.firefly.iot.device.service.RemoteConfigService;
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

@Tag(name = "远程配置", description = "设备远程配置模板、版本、下发与回滚")
@RestController
@RequestMapping("/api/v1/remote-configs")
@RequiredArgsConstructor
public class RemoteConfigController {

    private final RemoteConfigService remoteConfigService;

    @PostMapping
    @RequiresPermission("remote-config:create")
    @Operation(summary = "创建远程配置")
    public R<RemoteConfigVO> create(@Valid @RequestBody RemoteConfigCreateDTO dto) {
        return R.ok(remoteConfigService.create(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("remote-config:read")
    @Operation(summary = "分页查询远程配置")
    public R<IPage<RemoteConfigVO>> list(@RequestBody RemoteConfigQueryDTO query) {
        return R.ok(remoteConfigService.list(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("remote-config:read")
    @Operation(summary = "获取远程配置详情")
    public R<RemoteConfigVO> get(@Parameter(description = "配置编号", required = true) @PathVariable Long id) {
        return R.ok(remoteConfigService.get(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("remote-config:update")
    @Operation(summary = "更新远程配置")
    public R<RemoteConfigVO> update(@PathVariable Long id, @RequestBody RemoteConfigUpdateDTO dto) {
        return R.ok(remoteConfigService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("remote-config:delete")
    @Operation(summary = "删除远程配置")
    public R<Void> delete(@PathVariable Long id) {
        remoteConfigService.delete(id);
        return R.ok();
    }

    @PutMapping("/{id}/publish")
    @RequiresPermission("remote-config:update")
    @Operation(summary = "发布远程配置版本")
    public R<RemoteConfigVO> publish(@PathVariable Long id) {
        return R.ok(remoteConfigService.publish(id));
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("remote-config:update")
    @Operation(summary = "停用远程配置")
    public R<RemoteConfigVO> disable(@PathVariable Long id) {
        return R.ok(remoteConfigService.disable(id));
    }

    @PostMapping("/{id}/deploy")
    @RequiresPermission("remote-config:deploy")
    @Operation(summary = "下发远程配置")
    public R<RemoteConfigDeployResultVO> deploy(@PathVariable Long id,
                                                @RequestBody(required = false) RemoteConfigDeployDTO dto) {
        return R.ok(remoteConfigService.deploy(id, dto));
    }

    @GetMapping("/{id}/versions")
    @RequiresPermission("remote-config:read")
    @Operation(summary = "查询配置版本")
    public R<List<RemoteConfigVersionVO>> versions(@PathVariable Long id) {
        return R.ok(remoteConfigService.versions(id));
    }

    @PostMapping("/{id}/rollback")
    @RequiresPermission("remote-config:update")
    @Operation(summary = "回滚到历史版本")
    public R<RemoteConfigVO> rollback(@PathVariable Long id,
                                      @Valid @RequestBody RemoteConfigRollbackDTO dto) {
        return R.ok(remoteConfigService.rollback(id, dto.getVersion()));
    }

    @PostMapping("/{id}/assignments/list")
    @RequiresPermission("remote-config:read")
    @Operation(summary = "查询下发记录")
    public R<List<RemoteConfigAssignmentVO>> assignments(@PathVariable Long id) {
        return R.ok(remoteConfigService.assignments(id));
    }
}
