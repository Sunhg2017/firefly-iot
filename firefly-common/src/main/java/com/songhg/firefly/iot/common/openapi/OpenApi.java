package com.songhg.firefly.iot.common.openapi;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a controller method as an externally subscribable OpenAPI endpoint.
 * The system service will automatically register annotated endpoints into
 * {@code open_api_catalog} based on the resolved Spring MVC mapping.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface OpenApi {

    /**
     * Stable business code used across catalog, tenant subscription and AppKey scope binding.
     */
    String code();

    /**
     * Display name. Falls back to the controller method name when omitted.
     */
    String name() default "";

    /**
     * Downstream permission code granted for OpenAPI requests.
     * When omitted, the scanner falls back to a single-value {@code @RequiresPermission}.
     */
    String permissionCode() default "";

    /**
     * Whether the endpoint should be published to tenants after registration.
     */
    boolean enabled() default true;

    /**
     * Sort order shown in system management pages.
     */
    int sortOrder() default 0;

    /**
     * Endpoint description. Kept empty when omitted.
     */
    String description() default "";
}
