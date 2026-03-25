package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collection;
import java.util.LinkedHashSet;

import static org.assertj.core.api.Assertions.assertThat;

class AuthContextFeignInterceptorTest {

    private final AuthContextFeignInterceptor interceptor = new AuthContextFeignInterceptor();

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void shouldPropagateHeadersFromCurrentRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(AuthConstants.HEADER_AUTHORIZATION, "Bearer request-token");
        request.addHeader(AuthConstants.HEADER_TENANT_ID, "101");
        request.addHeader(AuthConstants.HEADER_USER_ID, "202");
        request.addHeader(AuthConstants.HEADER_USERNAME, "camera-admin");
        request.addHeader(AuthConstants.HEADER_PLATFORM, AuthConstants.PLATFORM_WEB);
        request.addHeader(AuthConstants.HEADER_GRANTED_PERMISSIONS, "video:create,video:read");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertThat(firstHeader(template, AuthConstants.HEADER_AUTHORIZATION)).isEqualTo("Bearer request-token");
        assertThat(firstHeader(template, AuthConstants.HEADER_TENANT_ID)).isEqualTo("101");
        assertThat(firstHeader(template, AuthConstants.HEADER_USER_ID)).isEqualTo("202");
        assertThat(firstHeader(template, AuthConstants.HEADER_USERNAME)).isEqualTo("camera-admin");
        assertThat(firstHeader(template, AuthConstants.HEADER_PLATFORM)).isEqualTo(AuthConstants.PLATFORM_WEB);
        assertThat(firstHeader(template, AuthConstants.HEADER_GRANTED_PERMISSIONS)).isEqualTo("video:create,video:read");
    }

    @Test
    void shouldFallbackToAppContextWhenNoRequestIsAvailable() {
        AppContext context = new AppContext();
        context.setTenantId(11L);
        context.setUserId(22L);
        context.setUsername("operator");
        context.setPlatform(AuthConstants.PLATFORM_OPEN_API);
        context.setAppKeyId(33L);
        context.setOpenApiCode("video:ingest");
        context.setPermissions(new LinkedHashSet<>(java.util.List.of("video:create", "video:read")));
        AppContextHolder.set(context);

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertThat(firstHeader(template, AuthConstants.HEADER_TENANT_ID)).isEqualTo("11");
        assertThat(firstHeader(template, AuthConstants.HEADER_USER_ID)).isEqualTo("22");
        assertThat(firstHeader(template, AuthConstants.HEADER_USERNAME)).isEqualTo("operator");
        assertThat(firstHeader(template, AuthConstants.HEADER_PLATFORM)).isEqualTo(AuthConstants.PLATFORM_OPEN_API);
        assertThat(firstHeader(template, AuthConstants.HEADER_APP_KEY_ID)).isEqualTo("33");
        assertThat(firstHeader(template, AuthConstants.HEADER_OPEN_API_CODE)).isEqualTo("video:ingest");
        assertThat(firstHeader(template, AuthConstants.HEADER_GRANTED_PERMISSIONS)).isEqualTo("video:create,video:read");
    }

    @Test
    void shouldNotOverwriteHeadersAlreadyPresentOnTemplate() {
        AppContext context = new AppContext();
        context.setTenantId(88L);
        AppContextHolder.set(context);

        RequestTemplate template = new RequestTemplate();
        template.header(AuthConstants.HEADER_TENANT_ID, "preset-tenant");
        interceptor.apply(template);

        assertThat(firstHeader(template, AuthConstants.HEADER_TENANT_ID)).isEqualTo("preset-tenant");
    }

    private String firstHeader(RequestTemplate template, String headerName) {
        Collection<String> values = template.headers().get(headerName);
        if (values == null || values.isEmpty()) {
            return null;
        }
        return values.iterator().next();
    }
}
