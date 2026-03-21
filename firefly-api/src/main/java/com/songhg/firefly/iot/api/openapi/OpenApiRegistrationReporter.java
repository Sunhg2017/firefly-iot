package com.songhg.firefly.iot.api.openapi;

import com.songhg.firefly.iot.api.client.OpenApiRegistryClient;
import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationSyncDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@RequiredArgsConstructor
public class OpenApiRegistrationReporter {

    private static final String APPLICATION_NAME_PREFIX = "firefly-";

    private final OpenApiEndpointScanner scanner;
    private final OpenApiRegistryClient registryClient;
    private final OpenApiRegistrationProperties properties;
    private final Environment environment;
    private final AtomicBoolean syncing = new AtomicBoolean(false);

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
            registryClient.sync(request);
            log.info("OpenAPI registration sync succeeded: trigger={}, serviceCode={}, itemCount={}",
                    trigger, serviceCode, request.getItems().size());
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
}
