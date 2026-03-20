package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationSyncDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "firefly-system", contextId = "openApiRegistryClient", path = "/api/v1/internal/open-apis")
public interface OpenApiRegistryClient {

    @PostMapping("/sync")
    R<Void> sync(@RequestBody OpenApiRegistrationSyncDTO request);
}
