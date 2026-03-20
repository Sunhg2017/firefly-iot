package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.system.dto.openapi.InternalOpenApiAuthRequest;
import com.songhg.firefly.iot.system.dto.openapi.InternalOpenApiAuthVO;
import com.songhg.firefly.iot.system.service.ApiKeyService;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Hidden
@RestController
@RequestMapping("/api/v1/internal/open-apis")
@RequiredArgsConstructor
public class OpenApiGatewayController {

    private final ApiKeyService apiKeyService;

    @PostMapping("/authorize")
    public R<InternalOpenApiAuthVO> authorize(@Valid @RequestBody InternalOpenApiAuthRequest request) {
        return R.ok(apiKeyService.authorizeOpenApiCall(request));
    }
}
