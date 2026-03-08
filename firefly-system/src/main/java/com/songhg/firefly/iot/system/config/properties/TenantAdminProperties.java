package com.songhg.firefly.iot.system.config.properties;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.util.ArrayList;
import java.util.List;

@Data
@Validated
@Component
@ConfigurationProperties(prefix = "firefly.tenant.admin")
public class TenantAdminProperties {

    @NotEmpty
    private List<@NotBlank String> defaultPermissions = new ArrayList<>();
}
