package com.songhg.firefly.iot.device.protocolparser.service;

import com.songhg.firefly.iot.api.client.ProtocolParserRuntimeClient;
import com.songhg.firefly.iot.api.dto.ProtocolParserMetricsDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginCatalogItemDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProtocolParserRuntimeService {

    private final ProtocolParserRuntimeClient protocolParserRuntimeClient;

    public List<ProtocolParserPluginDTO> listPlugins() {
        return requireData(protocolParserRuntimeClient.listPlugins(), "Failed to query runtime plugins");
    }

    public List<ProtocolParserPluginDTO> reloadPlugins() {
        return requireData(protocolParserRuntimeClient.reloadPlugins(), "Failed to reload runtime plugins");
    }

    public List<ProtocolParserPluginCatalogItemDTO> listPluginCatalog() {
        return requireData(protocolParserRuntimeClient.listPluginCatalog(), "Failed to query plugin catalog");
    }

    public ProtocolParserMetricsDTO getMetrics() {
        return requireData(protocolParserRuntimeClient.getMetrics(), "Failed to query runtime metrics");
    }

    private <T> T requireData(R<T> response, String errorMessage) {
        if (response == null || response.getData() == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, errorMessage);
        }
        return response.getData();
    }
}
