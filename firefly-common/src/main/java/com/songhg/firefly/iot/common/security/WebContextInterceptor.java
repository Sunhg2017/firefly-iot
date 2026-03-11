package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Web 上下文拦截器：从网关转发的请求头中解析用户和租户信息，
 * 填充到统一的 {@link AppContextHolder} 中。
 */
@Slf4j
public class WebContextInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String userIdStr = request.getHeader(AuthConstants.HEADER_USER_ID);
        String tenantIdStr = request.getHeader(AuthConstants.HEADER_TENANT_ID);
        String username = request.getHeader(AuthConstants.HEADER_USERNAME);
        String platform = request.getHeader(AuthConstants.HEADER_PLATFORM);

        AppContext ctx = new AppContext();

        // 填充租户信息
        if (tenantIdStr != null && !tenantIdStr.isBlank()) {
            ctx.setTenantId(Long.parseLong(tenantIdStr));
        }

        // 填充用户信息
        if (userIdStr != null && !userIdStr.isBlank()) {
            ctx.setUserId(Long.parseLong(userIdStr));
            ctx.setUsername(username);
            ctx.setPlatform(platform);
        }

        AppContextHolder.set(ctx);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AppContextHolder.clear();
    }
}
