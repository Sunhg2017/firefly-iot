package com.songhg.firefly.iot.common.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册 WebContextInterceptor，将 Gateway 注入的 Header 解析到 ThreadLocal 上下文。
 * 仅在 Servlet (非 WebFlux) 环境中生效。
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebMvcSecurityConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new WebContextInterceptor())
                .addPathPatterns("/api/**")
                .order(0);
    }
}
