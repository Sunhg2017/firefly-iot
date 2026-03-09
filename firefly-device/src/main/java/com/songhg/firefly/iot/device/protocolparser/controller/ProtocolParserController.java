package com.songhg.firefly.iot.device.protocolparser.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserEncodeResponseDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserCreateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserEncodeTestRequestDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserPublishDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserQueryDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserTestRequestDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserUpdateDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserVersionVO;
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

import java.util.List;

@Tag(name = "Protocol Parser Definitions")
@RestController
@RequestMapping("/api/v1/protocol-parsers")
@RequiredArgsConstructor
public class ProtocolParserController {

    private final ProtocolParserService protocolParserService;
    private final ProtocolParserDebugService protocolParserDebugService;

    @PostMapping
    @RequiresPermission("protocol-parser:create")
    @Operation(summary = "Create protocol parser definition")
    public R<ProtocolParserVO> create(@Valid @RequestBody ProtocolParserCreateDTO dto) {
        return R.ok(protocolParserService.create(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("protocol-parser:read")
    @Operation(summary = "List protocol parser definitions")
    public R<IPage<ProtocolParserVO>> list(@RequestBody ProtocolParserQueryDTO query) {
        return R.ok(protocolParserService.list(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("protocol-parser:read")
    @Operation(summary = "Get protocol parser definition")
    public R<ProtocolParserVO> getById(@Parameter(description = "Definition id", required = true) @PathVariable Long id) {
        return R.ok(protocolParserService.getById(id));
    }

    @GetMapping("/{id}/versions")
    @RequiresPermission("protocol-parser:read")
    @Operation(summary = "List version history")
    public R<List<ProtocolParserVersionVO>> listVersions(@PathVariable Long id) {
        return R.ok(protocolParserService.listVersions(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "Update protocol parser definition")
    public R<ProtocolParserVO> update(@PathVariable Long id, @Valid @RequestBody ProtocolParserUpdateDTO dto) {
        return R.ok(protocolParserService.update(id, dto));
    }

    @PostMapping("/{id}/test")
    @RequiresPermission("protocol-parser:test")
    @Operation(summary = "Execute uplink parser debug")
    public R<ProtocolParserDebugResponseDTO> test(@PathVariable Long id,
                                                  @RequestBody(required = false) ProtocolParserTestRequestDTO dto) {
        return R.ok(protocolParserDebugService.test(id, dto));
    }

    @PostMapping("/{id}/encode-test")
    @RequiresPermission("protocol-parser:test")
    @Operation(summary = "Execute downlink encoder debug")
    public R<ProtocolParserEncodeResponseDTO> encodeTest(@PathVariable Long id,
                                                         @RequestBody(required = false) ProtocolParserEncodeTestRequestDTO dto) {
        return R.ok(protocolParserDebugService.encodeTest(id, dto));
    }

    @PostMapping("/{id}/publish")
    @RequiresPermission("protocol-parser:publish")
    @Operation(summary = "Publish protocol parser definition")
    public R<ProtocolParserVO> publish(@PathVariable Long id,
                                       @RequestBody(required = false) ProtocolParserPublishDTO dto) {
        return R.ok(protocolParserService.publish(id, dto == null ? null : dto.getChangeLog()));
    }

    @PostMapping("/{id}/rollback/{version}")
    @RequiresPermission("protocol-parser:publish")
    @Operation(summary = "Rollback protocol parser definition")
    public R<ProtocolParserVO> rollback(@PathVariable Long id, @PathVariable("version") Integer version) {
        return R.ok(protocolParserService.rollback(id, version));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "Enable protocol parser definition")
    public R<Void> enable(@PathVariable Long id) {
        protocolParserService.enable(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("protocol-parser:update")
    @Operation(summary = "Disable protocol parser definition")
    public R<Void> disable(@PathVariable Long id) {
        protocolParserService.disable(id);
        return R.ok();
    }
}
