package com.songhg.firefly.iot.connector.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI connectorOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Firefly IoT - Connector API")
                        .description("数据接入网关：MQTT/HTTP/CoAP 协议适配")
                        .version("1.0.0"))
                .addSecurityItem(new SecurityRequirement().addList("Bearer"))
                .schemaRequirement("Bearer", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT"));
    }

    @Bean
    public GroupedOpenApi connectorApi() {
        return GroupedOpenApi.builder()
                .group("connector")
                .pathsToMatch("/api/v1/**")
                .build();
    }
}
