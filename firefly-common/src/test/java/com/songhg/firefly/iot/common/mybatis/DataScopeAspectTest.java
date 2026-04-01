package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DataScopeAspectTest {

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
        DataScopeContextHolder.clear();
    }

    @Test
    void keepsResolvedContextForEntireMethodAndCleansUpAfterwards() throws Throwable {
        AppContext appContext = new AppContext();
        appContext.setTenantId(2L);
        appContext.setUserId(99L);
        AppContextHolder.set(appContext);

        DataScopeContext resolved = new DataScopeContext();
        resolved.setScopeType(DataScopeType.PROJECT);
        resolved.setUserId(99L);
        resolved.setProjectIds(List.of(10L, 11L));

        DataScopeAspect aspect = new DataScopeAspect(objectProvider((userId, tenantId) -> resolved));
        ProceedingJoinPoint joinPoint = joinPointFor("annotatedMethod");

        when(joinPoint.proceed()).thenAnswer(invocation -> {
            DataScopeContext active = DataScopeContextHolder.get();
            assertThat(active).isSameAs(resolved);
            assertThat(active.getProjectColumn()).isEqualTo("project_id");
            assertThat(active.getDeviceColumn()).isEqualTo("id");
            assertThat(active.getCreatedByColumn()).isEqualTo("created_by");
            return "ok";
        });

        Object result = aspect.withDataScope(joinPoint);

        assertThat(result).isEqualTo("ok");
        assertThat(DataScopeContextHolder.get()).isNull();
    }

    @Test
    void restoresPreviousContextAfterNestedInvocation() throws Throwable {
        AppContext appContext = new AppContext();
        appContext.setTenantId(2L);
        appContext.setUserId(99L);
        AppContextHolder.set(appContext);

        DataScopeContext previous = new DataScopeContext();
        previous.setScopeType(DataScopeType.SELF);
        previous.setUserId(88L);
        DataScopeContextHolder.set(previous);

        DataScopeContext resolved = new DataScopeContext();
        resolved.setScopeType(DataScopeType.PROJECT);
        resolved.setUserId(99L);
        resolved.setProjectIds(List.of(10L));

        DataScopeAspect aspect = new DataScopeAspect(objectProvider((userId, tenantId) -> resolved));
        ProceedingJoinPoint joinPoint = joinPointFor("annotatedMethod");

        when(joinPoint.proceed()).thenAnswer(invocation -> {
            assertThat(DataScopeContextHolder.get()).isSameAs(resolved);
            return null;
        });

        aspect.withDataScope(joinPoint);

        assertThat(DataScopeContextHolder.get()).isSameAs(previous);
    }

    private ProceedingJoinPoint joinPointFor(String methodName) throws NoSuchMethodException {
        Method method = TestTarget.class.getDeclaredMethod(methodName);
        MethodSignature signature = mock(MethodSignature.class);
        when(signature.getMethod()).thenReturn(method);

        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        when(joinPoint.getSignature()).thenReturn(signature);
        return joinPoint;
    }

    private ObjectProvider<DataScopeResolver> objectProvider(DataScopeResolver resolver) {
        ObjectProvider<DataScopeResolver> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(resolver);
        return provider;
    }

    static class TestTarget {

        @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "id", groupColumn = "")
        void annotatedMethod() {
        }
    }
}
