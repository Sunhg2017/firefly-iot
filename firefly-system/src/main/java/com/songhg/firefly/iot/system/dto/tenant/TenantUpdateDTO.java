package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Tenant update request.
 */
@Data
@Schema(description = "Tenant update request")
public class TenantUpdateDTO {

    @Schema(description = "Tenant name")
    private String name;

    @Schema(description = "Display name")
    private String displayName;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Contact person name")
    private String contactName;

    @Schema(description = "Contact phone")
    private String contactPhone;

    @Schema(description = "Contact email")
    private String contactEmail;

    @Schema(description = "Logo URL")
    private String logoUrl;
}
