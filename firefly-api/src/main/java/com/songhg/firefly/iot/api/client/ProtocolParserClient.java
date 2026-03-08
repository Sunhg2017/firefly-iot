package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "firefly-device", contextId = "protocolParserClient", path = "/api/v1/internal/protocol-parsers")
public interface ProtocolParserClient {

    @GetMapping("/products/{productId}/published")
    R<List<ProtocolParserPublishedDTO>> getPublishedByProductId(@PathVariable("productId") Long productId);
}
