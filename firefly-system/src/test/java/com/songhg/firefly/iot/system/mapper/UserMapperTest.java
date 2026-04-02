package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class UserMapperTest {

    @Test
    void findByIdentifierGlobalShouldBypassTenantLineInterceptor() throws NoSuchMethodException {
        Method method = UserMapper.class.getMethod("findByIdentifierGlobal", String.class);

        InterceptorIgnore annotation = method.getAnnotation(InterceptorIgnore.class);
        assertNotNull(annotation);
        assertEquals("true", annotation.tenantLine());
    }
}
