package com.songhg.firefly.iot.device.protocolparser.controller;

import com.songhg.firefly.iot.api.dto.ProtocolParserMetricsDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginCatalogItemDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.protocolparser.service.ProtocolParserRuntimeService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Protocol Parser Runtime")
@RestController
@RequestMapping("/api/v1/protocol-parsers/runtime")
@RequiredArgsConstructor
public class ProtocolParserRuntimeController {

    private final ProtocolParserRuntimeService protocolParserRuntimeService;

    @GetMapping("/plugins")
    @RequiresPermission("protocol-parser:read")
    public R<List<ProtocolParserPluginDTO>> listPlugins() {
        return R.ok(protocolParserRuntimeService.listPlugins());
    }

    @PostMapping("/plugins/reload")
    @RequiresPermission("protocol-parser:update")
    public R<List<ProtocolParserPluginDTO>> reloadPlugins() {
        return R.ok(protocolParserRuntimeService.reloadPlugins());
    }

    @GetMapping("/plugins/catalog")
    @RequiresPermission("protocol-parser:read")
    public R<List<ProtocolParserPluginCatalogItemDTO>> listPluginCatalog() {
        return R.ok(protocolParserRuntimeService.listPluginCatalog());
    }

    @GetMapping("/metrics")
    @RequiresPermission("protocol-parser:read")
    public R<ProtocolParserMetricsDTO> metrics() {
        return R.ok(protocolParserRuntimeService.getMetrics());
    }
}
