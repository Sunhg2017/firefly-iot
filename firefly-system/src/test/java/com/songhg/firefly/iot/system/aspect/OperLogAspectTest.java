package com.songhg.firefly.iot.system.aspect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.system.service.OperationLogService;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OperLogAspectTest {

    private OperLogAspect aspect;

    @BeforeEach
    void setUp() {
        aspect = new OperLogAspect(Mockito.mock(OperationLogService.class), new ObjectMapper());
    }

    @Test
    void shouldSkipSecurityLogControllersAndHiddenControllers() throws NoSuchMethodException {
        assertTrue(aspect.shouldSkip(OperationLogController.class, OperationLogController.class.getMethod("list")));
        assertTrue(aspect.shouldSkip(HiddenControllerStub.class, HiddenControllerStub.class.getMethod("sync")));
        assertFalse(aspect.shouldSkip(UserControllerStub.class, UserControllerStub.class.getMethod("create")));
    }

    @Test
    void shouldResolveModuleAndDescriptionFromOpenApiAnnotations() throws NoSuchMethodException {
        Method method = UserControllerStub.class.getMethod("create");
        assertEquals("用户管理", aspect.resolveModule(UserControllerStub.class, null));
        assertEquals("创建用户", aspect.resolveDescription(method, null));
    }

    @Test
    void shouldResolveOperationTypeFromDescriptionKeywords() throws NoSuchMethodException {
        assertEquals("CREATE", aspect.resolveOperationTypeFromDescription("创建用户"));
        assertEquals("UPDATE", aspect.resolveOperationTypeFromDescription("重置租户管理员密码"));
        assertEquals("DELETE", aspect.resolveOperationTypeFromDescription("清理过期日志"));
        assertEquals("QUERY", aspect.resolveOperationTypeFromDescription("分页查询用户列表"));
        assertEquals("LOGIN", aspect.resolveOperationTypeFromDescription("用户登录"));
        assertEquals("LOGOUT", aspect.resolveOperationTypeFromDescription("登出当前会话"));
        assertEquals("EXPORT", aspect.resolveOperationTypeFromDescription("导出设备三元组"));
    }

    @Test
    void shouldResolveOperationTypeFromRequestWhenDescriptionHasNoKeywords() {
        assertEquals("QUERY", aspect.resolveOperationTypeFromRequest("GET", "/api/v1/users/1"));
        assertEquals("QUERY", aspect.resolveOperationTypeFromRequest("POST", "/api/v1/users/list"));
        assertEquals("LOGIN", aspect.resolveOperationTypeFromRequest("POST", "/api/v1/auth/login"));
        assertEquals("LOGOUT", aspect.resolveOperationTypeFromRequest("POST", "/api/v1/auth/logout"));
        assertEquals("DELETE", aspect.resolveOperationTypeFromRequest("POST", "/api/v1/operation-logs/clean"));
        assertEquals("UPDATE", aspect.resolveOperationTypeFromRequest("PUT", "/api/v1/users/1/status"));
        assertEquals("CREATE", aspect.resolveOperationTypeFromRequest("POST", "/api/v1/users"));
    }

    @Tag(name = "用户管理")
    static class UserControllerStub {
        @Operation(summary = "创建用户")
        public void create() {
        }
    }

    static class OperationLogController {
        public void list() {
        }
    }

    @Hidden
    static class HiddenControllerStub {
        public void sync() {
        }
    }
}
