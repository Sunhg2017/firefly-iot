package com.songhg.firefly.iot.device.protocolparser.controller;

import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserCreateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserPublishDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserQueryDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserTestRequestDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserUpdateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserVO;
import com.songhg.firefly.iot.device.protocolparser.service.ProtocolParserDebugService;
import com.songhg.firefly.iot.device.protocolparser.service.ProtocolParserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "协议解析定义", description = "产品级协议解析定义管理")
@RestController
@RequestMapping("/api/v1/protocol-parsers")
@RequiredArgsConstructor
public class ProtocolParserController {

    private final ProtocolParserService protocolParserService;
    private final ProtocolParserDebugService protocolParserDebugService;

    @PostMapping
    @RequiresPermission("protocol-parser:create")
    @Operation(summary = "创建协议解析定义")
    public R<ProtocolParserVO> create(@Valid @RequestBody ProtocolParserCreateDTO dto) {
        return R.ok(protocolParserService.create(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("protocol-parser:read")
    @Operation(summary = "分页查询协议解析定义")
    public R<IPage<ProtocolParserVO>> list(@RequestBody ProtocolParserQueryDTO query) {
        return R.ok(protocolParserService.list(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("protocol-parser:read")
    @Operation(summary = "查询协议解析定义详情")
    public R<ProtocolParserVO> getById(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id) {
        return R.ok(protocolParserService.getById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "更新协议解析定义草稿")
    public R<ProtocolParserVO> update(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id,
            @Valid @RequestBody ProtocolParserUpdateDTO dto) {
        return R.ok(protocolParserService.update(id, dto));
    }

    @PostMapping("/{id}/test")
    @RequiresPermission("protocol-parser:test")
    @Operation(summary = "调试执行协议解析定义")
    public R<ProtocolParserDebugResponseDTO> test(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id,
            @RequestBody(required = false) ProtocolParserTestRequestDTO dto) {
        return R.ok(protocolParserDebugService.test(id, dto));
    }

    @PostMapping("/{id}/publish")
    @RequiresPermission("protocol-parser:publish")
    @Operation(summary = "发布协议解析定义")
    public R<ProtocolParserVO> publish(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id,
            @RequestBody(required = false) ProtocolParserPublishDTO dto) {
        return R.ok(protocolParserService.publish(id, dto == null ? null : dto.getChangeLog()));
    }

    @PostMapping("/{id}/rollback/{version}")
    @RequiresPermission("protocol-parser:publish")
    @Operation(summary = "回滚协议解析定义版本")
    public R<ProtocolParserVO> rollback(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id,
            @Parameter(description = "目标版本号", required = true) @PathVariable("version") Integer version) {
        return R.ok(protocolParserService.rollback(id, version));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "启用协议解析定义")
    public R<Void> enable(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id) {
        protocolParserService.enable(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "停用协议解析定义")
    public R<Void> disable(
            @Parameter(description = "解析定义编号", required = true) @PathVariable Long id) {
        protocolParserService.disable(id);
        return R.ok();
    }
}
