package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Tenant quota update request.
 */
@Data
@Schema(description = "Tenant quota update request")
public class TenantQuotaUpdateDTO {

    @Schema(description = "Max devices")
    private Integer maxDevices;

    @Schema(description = "Max messages per second")
    private Integer maxMsgPerSec;

    @Schema(description = "Max rules")
    private Integer maxRules;

    @Schema(description = "Data retention days")
    private Integer dataRetentionDays;

    @Schema(description = "Max OTA storage in GB")
    private Integer maxOtaStorageGb;

    @Schema(description = "Max API calls per day")
    private Integer maxApiCallsDay;

    @Schema(description = "Max users")
    private Integer maxUsers;

    @Schema(description = "Max projects")
    private Integer maxProjects;

    @Schema(description = "Max video channels")
    private Integer maxVideoChannels;

    @Schema(description = "Max video storage in GB")
    private Integer maxVideoStorageGb;

    @Schema(description = "Max share policies")
    private Integer maxSharePolicies;
}
