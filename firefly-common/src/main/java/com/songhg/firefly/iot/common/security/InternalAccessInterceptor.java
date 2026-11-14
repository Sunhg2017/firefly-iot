package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 内部接口访问拦截器：校验服务间共享令牌。
 * 令牌未配置或请求未携带匹配令牌时直接拒绝，不能依赖接口路径包含 internal 作为授权。
 */
@Slf4j
@RequiredArgsConstructor
public class InternalAccessInterceptor implements HandlerInterceptor {

    private final InternalAuthProperties properties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String expected = properties.getToken();
        String provided = request.getHeader(AuthConstants.HEADER_INTERNAL_TOKEN);
        boolean allowed = StringUtils.hasText(expected) && expected.equals(provided);
        if (!allowed) {
            log.warn("Rejected internal request without valid service token: {} {}", request.getMethod(), request.getRequestURI());
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            return false;
        }
        return true;
    }
}
