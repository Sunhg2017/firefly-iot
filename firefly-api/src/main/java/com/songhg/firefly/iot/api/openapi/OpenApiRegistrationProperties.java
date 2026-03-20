package com.songhg.firefly.iot.api.openapi;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "firefly.openapi.registry")
public class OpenApiRegistrationProperties {

    private boolean enabled = true;

    /**
     * Optional explicit override. Defaults to deriving from spring.application.name.
     */
    private String serviceCode;

    private long initialDelayMs = 10000L;

    private long fixedDelayMs = 300000L;
}
