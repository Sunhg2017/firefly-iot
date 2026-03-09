package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.ProtocolParserMetricsDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginCatalogItemDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.util.List;

@FeignClient(name = "firefly-connector", contextId = "protocolParserRuntimeClient", path = "/api/v1/internal/protocol-parsers/runtime")
public interface ProtocolParserRuntimeClient {

    @GetMapping("/plugins")
    R<List<ProtocolParserPluginDTO>> listPlugins();

    @PostMapping("/plugins/reload")
    R<List<ProtocolParserPluginDTO>> reloadPlugins();

    @GetMapping("/plugins/catalog")
    R<List<ProtocolParserPluginCatalogItemDTO>> listPluginCatalog();

    @GetMapping("/metrics")
    R<ProtocolParserMetricsDTO> getMetrics();
}
