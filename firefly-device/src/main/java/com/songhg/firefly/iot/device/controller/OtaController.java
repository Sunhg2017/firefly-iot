package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.ota.FirmwareCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareQueryDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareUpdateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareVO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskQueryDTO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskVO;
import com.songhg.firefly.iot.device.service.OtaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "OTA 与固件", description = "固件库、设备版本与 OTA 升级任务")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class OtaController {

    private final OtaService otaService;

    // ==================== Firmware ====================

    @PostMapping("/firmwares")
    @RequiresPermission("ota:upload")
    @Operation(summary = "创建固件")
    public R<FirmwareVO> createFirmware(@Valid @RequestBody FirmwareCreateDTO dto) {
        return R.ok(otaService.createFirmware(dto));
    }

    @PostMapping("/firmwares/list")
    @RequiresPermission("ota:read")
    @Operation(summary = "查询固件列表")
    public R<IPage<FirmwareVO>> listFirmwares(@RequestBody FirmwareQueryDTO query) {
        return R.ok(otaService.listFirmwares(query));
    }

    @GetMapping("/firmwares/{id}")
    @RequiresPermission("ota:read")
    @Operation(summary = "获取固件详情")
    public R<FirmwareVO> getFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long id) {
        return R.ok(otaService.getFirmwareById(id));
    }

    @Operation(summary = "更新固件")
    @PutMapping("/firmwares/{id}")
    @RequiresPermission("ota:upload")
    public R<FirmwareVO> updateFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long id,
            @Valid @RequestBody FirmwareUpdateDTO dto) {
        return R.ok(otaService.updateFirmware(id, dto));
    }

    @Operation(summary = "验证固件")
    @PutMapping("/firmwares/{id}/verify")
    @RequiresPermission("ota:upload")
    public R<Void> verifyFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long id) {
        otaService.verifyFirmware(id);
        return R.ok();
    }

    @Operation(summary = "发布固件")
    @PutMapping("/firmwares/{id}/release")
    @RequiresPermission("ota:upload")
    public R<Void> releaseFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long id) {
        otaService.releaseFirmware(id);
        return R.ok();
    }

    @DeleteMapping("/firmwares/{id}")
    @RequiresPermission("ota:delete")
    @Operation(summary = "删除固件")
    public R<Void> deleteFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long id) {
        otaService.deleteFirmware(id);
        return R.ok();
    }

    // ==================== OTA Tasks ====================

    @PostMapping("/ota-tasks")
    @RequiresPermission("ota:deploy")
    @Operation(summary = "创建 OTA 任务")
    public R<OtaTaskVO> createOtaTask(@Valid @RequestBody OtaTaskCreateDTO dto) {
        return R.ok(otaService.createOtaTask(dto));
    }

    @PostMapping("/ota-tasks/list")
    @RequiresPermission("ota:read")
    @Operation(summary = "查询 OTA 任务列表")
    public R<IPage<OtaTaskVO>> listOtaTasks(@RequestBody OtaTaskQueryDTO query) {
        return R.ok(otaService.listOtaTasks(query));
    }

    @GetMapping("/ota-tasks/{id}")
    @RequiresPermission("ota:read")
    @Operation(summary = "获取 OTA 任务详情")
    public R<OtaTaskVO> getOtaTask(
            @Parameter(description = "升级任务编号", required = true) @PathVariable Long id) {
        return R.ok(otaService.getOtaTaskById(id));
    }

    @PutMapping("/ota-tasks/{id}/cancel")
    @RequiresPermission("ota:deploy")
    @Operation(summary = "取消 OTA 任务")
    public R<Void> cancelOtaTask(
            @Parameter(description = "升级任务编号", required = true) @PathVariable Long id) {
        otaService.cancelOtaTask(id);
        return R.ok();
    }
}
