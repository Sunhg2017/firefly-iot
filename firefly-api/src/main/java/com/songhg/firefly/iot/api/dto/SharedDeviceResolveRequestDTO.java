package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Shared-device resolution request used by the rule service.
 */
@Data
public class SharedDeviceResolveRequestDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long ownerTenantId;
    private String scope;
}
