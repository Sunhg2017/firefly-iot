package com.songhg.firefly.iot.api.openapi;

import com.songhg.firefly.iot.api.dto.openapi.OpenApiRegistrationItemDTO;
import com.songhg.firefly.iot.common.openapi.OpenApi;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.util.ClassUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.util.pattern.PathPattern;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class OpenApiEndpointScanner {

    private final RequestMappingHandlerMapping handlerMapping;

    public OpenApiEndpointScanner(RequestMappingHandlerMapping handlerMapping) {
        this.handlerMapping = handlerMapping;
    }

    public List<OpenApiRegistrationItemDTO> scanAnnotatedEndpoints() {
        List<OpenApiRegistrationItemDTO> items = new ArrayList<>();
        handlerMapping.getHandlerMethods().entrySet().stream()
                .sorted(Comparator.comparing(entry -> entry.getKey().toString()))
                .forEach(entry -> {
                    OpenApi annotation = findMethodAnnotation(entry.getValue(), OpenApi.class);
                    if (annotation == null) {
                        return;
                    }
                    items.add(buildItem(entry.getKey(), entry.getValue(), annotation));
                });
        return items;
    }

    private OpenApiRegistrationItemDTO buildItem(RequestMappingInfo mappingInfo,
                                                 HandlerMethod handlerMethod,
                                                 OpenApi annotation) {
        Method method = handlerMethod.getMethod();
        String pathPattern = extractSinglePath(mappingInfo, method);
        String httpMethod = extractSingleHttpMethod(mappingInfo, method);
        String permissionCode = resolvePermissionCode(handlerMethod, annotation);
        String name = resolveDisplayName(handlerMethod, annotation);
        String description = resolveDescription(handlerMethod, annotation);

        OpenApiRegistrationItemDTO item = new OpenApiRegistrationItemDTO();
        item.setCode(annotation.code().trim());
        item.setName(name);
        item.setHttpMethod(httpMethod);
        item.setPathPattern(pathPattern);
        item.setPermissionCode(permissionCode);
        item.setEnabled(annotation.enabled());
        item.setSortOrder(annotation.sortOrder());
        item.setDescription(description);
        return item;
    }

    private String extractSinglePath(RequestMappingInfo mappingInfo, Method method) {
        List<String> patterns = new ArrayList<>();
        if (mappingInfo.getPathPatternsCondition() != null) {
            for (PathPattern pattern : mappingInfo.getPathPatternsCondition().getPatterns()) {
                patterns.add(pattern.getPatternString());
            }
        } else if (mappingInfo.getPatternsCondition() != null) {
            patterns.addAll(mappingInfo.getPatternsCondition().getPatterns());
        }
        if (patterns.size() != 1 || !StringUtils.hasText(patterns.getFirst())) {
            throw new IllegalStateException("@OpenApi requires exactly one request path on " + method);
        }
        String path = patterns.getFirst().trim();
        return path.startsWith("/") ? path : "/" + path;
    }

    private String extractSingleHttpMethod(RequestMappingInfo mappingInfo, Method method) {
        Set<RequestMethod> methods = mappingInfo.getMethodsCondition().getMethods();
        if (methods.size() != 1) {
            throw new IllegalStateException("@OpenApi requires exactly one HTTP method on " + method);
        }
        return methods.iterator().next().name().toUpperCase(Locale.ROOT);
    }

    private String resolvePermissionCode(HandlerMethod handlerMethod, OpenApi annotation) {
        if (StringUtils.hasText(annotation.permissionCode())) {
            return annotation.permissionCode().trim();
        }
        RequiresPermission requiresPermission = findMethodAnnotation(handlerMethod, RequiresPermission.class);
        if (requiresPermission != null && requiresPermission.value().length == 1
                && StringUtils.hasText(requiresPermission.value()[0])) {
            return requiresPermission.value()[0].trim();
        }
        throw new IllegalStateException("@OpenApi requires explicit permissionCode or a single @RequiresPermission on "
                + handlerMethod.getMethod());
    }

    private String resolveDisplayName(HandlerMethod handlerMethod, OpenApi annotation) {
        if (StringUtils.hasText(annotation.name())) {
            return annotation.name().trim();
        }
        return handlerMethod.getMethod().getName();
    }

    private String resolveDescription(HandlerMethod handlerMethod, OpenApi annotation) {
        if (StringUtils.hasText(annotation.description())) {
            return annotation.description().trim();
        }
        return null;
    }

    private <A extends java.lang.annotation.Annotation> A findMethodAnnotation(HandlerMethod handlerMethod,
                                                                               Class<A> annotationType) {
        Method method = handlerMethod.getMethod();
        A annotation = AnnotatedElementUtils.findMergedAnnotation(method, annotationType);
        if (annotation != null) {
            return annotation;
        }
        for (Class<?> interfaceType : ClassUtils.getAllInterfacesForClassAsSet(handlerMethod.getBeanType())) {
            try {
                Method interfaceMethod = interfaceType.getMethod(method.getName(), method.getParameterTypes());
                annotation = AnnotatedElementUtils.findMergedAnnotation(interfaceMethod, annotationType);
                if (annotation != null) {
                    return annotation;
                }
            } catch (NoSuchMethodException ignored) {
                // The controller method is not declared on this interface.
            }
        }
        return null;
    }
}
