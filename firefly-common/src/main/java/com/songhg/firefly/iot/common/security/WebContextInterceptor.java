package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.TenantContext;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContext;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Web 上下文拦截器：从网关转发的请求头中解析用户和租户信息，填充到 ThreadLocal 上下文中。
 */
@Slf4j
public class WebContextInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String userIdStr = request.getHeader(AuthConstants.HEADER_USER_ID);
        String tenantIdStr = request.getHeader(AuthConstants.HEADER_TENANT_ID);
        String username = request.getHeader(AuthConstants.HEADER_USERNAME);
        String platform = request.getHeader(AuthConstants.HEADER_PLATFORM);

        // 填充用户上下文
        if (userIdStr != null && !userIdStr.isBlank()) {
            UserContext userCtx = new UserContext();
            userCtx.setUserId(Long.parseLong(userIdStr));
            userCtx.setUsername(username);
            if (tenantIdStr != null && !tenantIdStr.isBlank()) {
                userCtx.setTenantId(Long.parseLong(tenantIdStr));
            }
            userCtx.setPlatform(platform);
            UserContextHolder.set(userCtx);
        }

        // 填充租户上下文
        if (tenantIdStr != null && !tenantIdStr.isBlank()) {
            TenantContext tenantCtx = new TenantContext();
            tenantCtx.setTenantId(Long.parseLong(tenantIdStr));
            TenantContextHolder.set(tenantCtx);
        }

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContextHolder.clear();
        TenantContextHolder.clear();
    }
}
