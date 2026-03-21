package com.songhg.firefly.iot.api.openapi;

import com.songhg.firefly.iot.api.client.OpenApiRegistryClient;
import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationSyncDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@RequiredArgsConstructor
public class OpenApiRegistrationReporter {

    private static final String APPLICATION_NAME_PREFIX = "firefly-";
    private static final String DEFAULT_LOCAL_HOST = "127.0.0.1";

    private final OpenApiEndpointScanner scanner;
    private final OpenApiRegistryClient registryClient;
    private final OpenApiRegistrationProperties properties;
    private final Environment environment;
    private final AtomicBoolean syncing = new AtomicBoolean(false);
    private final RestTemplate restTemplate = new RestTemplate();

    @Scheduled(
            initialDelayString = "${firefly.openapi.registry.initial-delay-ms:10000}",
            fixedDelayString = "${firefly.openapi.registry.fixed-delay-ms:300000}"
    )
    public void syncOnSchedule() {
        // OpenAPI registry sync should never become a hard startup dependency of business services.
        publishRegistrations("schedule");
    }

    private void publishRegistrations(String trigger) {
        if (!properties.isEnabled()) {
            return;
        }
        String serviceCode = resolveServiceCode();
        if (!StringUtils.hasText(serviceCode)) {
            log.debug("Skip OpenAPI registration sync because service code is unavailable");
            return;
        }
        if (!syncing.compareAndSet(false, true)) {
            return;
        }
        try {
            OpenApiRegistrationSyncDTO request = new OpenApiRegistrationSyncDTO();
            request.setServiceCode(serviceCode);
            request.setItems(scanner.scanAnnotatedEndpoints());
            request.setApiDocJson(loadCurrentServiceApiDocJson());
            registryClient.sync(request);
            log.info("OpenAPI registration sync succeeded: trigger={}, serviceCode={}, itemCount={}, apiDocSynced={}",
                    trigger, serviceCode, request.getItems().size(), StringUtils.hasText(request.getApiDocJson()));
        } catch (Exception e) {
            log.error("OpenAPI registration sync failed: trigger={}, serviceCode={}", trigger, serviceCode, e);
        } finally {
            syncing.set(false);
        }
    }

    private String resolveServiceCode() {
        if (StringUtils.hasText(properties.getServiceCode())) {
            return properties.getServiceCode().trim().toUpperCase(Locale.ROOT);
        }
        String applicationName = environment.getProperty("spring.application.name");
        if (!StringUtils.hasText(applicationName)) {
            return null;
        }
        String normalized = applicationName.trim();
        if (normalized.startsWith(APPLICATION_NAME_PREFIX)) {
            normalized = normalized.substring(APPLICATION_NAME_PREFIX.length());
        }
        return normalized.replace('-', '_').toUpperCase(Locale.ROOT);
    }

    private String loadCurrentServiceApiDocJson() {
        Integer port = environment.getProperty("local.server.port", Integer.class);
        if (port == null) {
            port = environment.getProperty("server.port", Integer.class);
        }
        if (port == null || port <= 0) {
            log.warn("Skip OpenAPI apiDoc sync because local server port is unavailable");
            return null;
        }

        String contextPath = environment.getProperty("server.servlet.context-path", "");
        String apiDocsPath = environment.getProperty("springdoc.api-docs.path", "/v3/api-docs");
        URI uri = UriComponentsBuilder.newInstance()
                .scheme("http")
                .host(DEFAULT_LOCAL_HOST)
                .port(port)
                .path(StringUtils.hasText(contextPath) ? contextPath : "")
                .path(StringUtils.hasText(apiDocsPath) ? apiDocsPath : "/v3/api-docs")
                .build(true)
                .toUri();
        try {
            return restTemplate.getForObject(uri, String.class);
        } catch (RestClientException ex) {
            log.warn("Failed to load current service OpenAPI file from {}", uri, ex);
            return null;
        }
    }
}
