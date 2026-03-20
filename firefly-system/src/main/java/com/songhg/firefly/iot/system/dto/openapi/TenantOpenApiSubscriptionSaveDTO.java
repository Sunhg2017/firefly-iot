package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "Tenant OpenAPI subscription save request")
public class TenantOpenApiSubscriptionSaveDTO {

    @Valid
    @Schema(description = "Subscribed OpenAPI items")
    private List<TenantOpenApiSubscriptionItemDTO> items = new ArrayList<>();
}
