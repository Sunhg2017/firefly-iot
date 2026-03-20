package com.songhg.firefly.iot.api.openapi;

import com.songhg.firefly.iot.api.client.OpenApiRegistryClient;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@AutoConfiguration
@ConditionalOnClass(RequestMappingHandlerMapping.class)
@ConditionalOnBean({RequestMappingHandlerMapping.class, OpenApiRegistryClient.class})
@ConditionalOnProperty(prefix = "firefly.openapi.registry", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(OpenApiRegistrationProperties.class)
public class OpenApiRegistrationAutoConfiguration {

    @Bean
    public OpenApiEndpointScanner openApiEndpointScanner(RequestMappingHandlerMapping handlerMapping) {
        return new OpenApiEndpointScanner(handlerMapping);
    }

    @Bean
    public OpenApiRegistrationReporter openApiRegistrationReporter(OpenApiEndpointScanner scanner,
                                                                   OpenApiRegistryClient registryClient,
                                                                   OpenApiRegistrationProperties properties,
                                                                   Environment environment) {
        return new OpenApiRegistrationReporter(scanner, registryClient, properties, environment);
    }
}
