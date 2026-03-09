package com.songhg.firefly.iot.connector.parser.controller;

import com.songhg.firefly.iot.api.dto.ProtocolParserMetricsDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginCatalogItemDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParserMetricsService;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParserPluginRegistry;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Internal protocol parser runtime")
@RestController
@RequestMapping("/api/v1/internal/protocol-parsers/runtime")
@RequiredArgsConstructor
public class InternalProtocolParserRuntimeController {

    private final ProtocolParserPluginRegistry pluginRegistry;
    private final ProtocolParserMetricsService metricsService;

    @GetMapping("/plugins")
    public R<List<ProtocolParserPluginDTO>> listPlugins() {
        return R.ok(pluginRegistry.listInstalled());
    }

    @PostMapping("/plugins/reload")
    public R<List<ProtocolParserPluginDTO>> reloadPlugins() {
        return R.ok(pluginRegistry.reload());
    }

    @GetMapping("/plugins/catalog")
    public R<List<ProtocolParserPluginCatalogItemDTO>> listPluginCatalog() {
        return R.ok(pluginRegistry.listCatalog());
    }

    @GetMapping("/metrics")
    public R<ProtocolParserMetricsDTO> metrics() {
        return R.ok(metricsService.snapshot());
    }
}
