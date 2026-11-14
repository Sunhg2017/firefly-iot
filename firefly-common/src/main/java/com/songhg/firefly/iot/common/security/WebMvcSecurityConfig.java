package com.songhg.firefly.iot.common.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册 WebContextInterceptor 与内部接口访问拦截器。
 * 仅在 Servlet (非 WebFlux) 环境中生效。
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebMvcSecurityConfig implements WebMvcConfigurer {

    private final InternalAuthProperties internalAuthProperties;

    public WebMvcSecurityConfig(InternalAuthProperties internalAuthProperties) {
        this.internalAuthProperties = internalAuthProperties;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new WebContextInterceptor())
                .addPathPatterns("/api/**")
                .order(0);
        registry.addInterceptor(new InternalAccessInterceptor(internalAuthProperties))
                .addPathPatterns("/api/v1/internal/**")
                .order(1);
    }
}
