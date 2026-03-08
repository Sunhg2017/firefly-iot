package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.ProtocolParserDebugRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "firefly-connector", contextId = "protocolParserDebugClient", path = "/api/v1/internal/protocol-parsers")
public interface ProtocolParserDebugClient {

    @PostMapping("/debug")
    R<ProtocolParserDebugResponseDTO> debug(@RequestBody ProtocolParserDebugRequestDTO request);
}
