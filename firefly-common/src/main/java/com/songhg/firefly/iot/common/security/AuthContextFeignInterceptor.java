package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collection;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Feign 请求上下文透传拦截器。
 * 保证跨服务调用继续携带当前租户、用户与权限头，避免下游内部接口在同一业务链路中丢失可见范围。
 */
@Component
public class AuthContextFeignInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        HttpServletRequest request = resolveCurrentRequest();
        if (request != null) {
            copyHeader(request, template, AuthConstants.HEADER_AUTHORIZATION);
            copyHeader(request, template, AuthConstants.HEADER_TENANT_ID);
            copyHeader(request, template, AuthConstants.HEADER_USER_ID);
            copyHeader(request, template, AuthConstants.HEADER_USERNAME);
            copyHeader(request, template, AuthConstants.HEADER_PLATFORM);
            copyHeader(request, template, AuthConstants.HEADER_APP_KEY_ID);
            copyHeader(request, template, AuthConstants.HEADER_OPEN_API_CODE);
            copyHeader(request, template, AuthConstants.HEADER_GRANTED_PERMISSIONS);
        }

        AppContext context = AppContextHolder.get();
        if (context == null) {
            return;
        }
        applyHeaderIfAbsent(template, AuthConstants.HEADER_TENANT_ID, stringify(context.getTenantId()));
        applyHeaderIfAbsent(template, AuthConstants.HEADER_USER_ID, stringify(context.getUserId()));
        applyHeaderIfAbsent(template, AuthConstants.HEADER_USERNAME, context.getUsername());
        applyHeaderIfAbsent(template, AuthConstants.HEADER_PLATFORM, context.getPlatform());
        applyHeaderIfAbsent(template, AuthConstants.HEADER_APP_KEY_ID, stringify(context.getAppKeyId()));
        applyHeaderIfAbsent(template, AuthConstants.HEADER_OPEN_API_CODE, context.getOpenApiCode());
        applyHeaderIfAbsent(template, AuthConstants.HEADER_GRANTED_PERMISSIONS, joinPermissions(context.getPermissions()));
    }

    private HttpServletRequest resolveCurrentRequest() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servletRequestAttributes) {
            return servletRequestAttributes.getRequest();
        }
        return null;
    }

    private void copyHeader(HttpServletRequest request, RequestTemplate template, String headerName) {
        applyHeaderIfAbsent(template, headerName, request.getHeader(headerName));
    }

    private void applyHeaderIfAbsent(RequestTemplate template, String headerName, String value) {
        String normalizedValue = trimToNull(value);
        if (normalizedValue == null) {
            return;
        }
        Collection<String> existingValues = template.headers().get(headerName);
        if (existingValues != null && !existingValues.isEmpty()) {
            return;
        }
        template.header(headerName, normalizedValue);
    }

    private String joinPermissions(Set<String> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return null;
        }
        String joined = permissions.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .collect(Collectors.joining(","));
        return trimToNull(joined);
    }

    private String stringify(Long value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
