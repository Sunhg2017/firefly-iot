package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiSubscriptionVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAuthorizationVO;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.RolePermission;
import com.songhg.firefly.iot.system.entity.Tenant;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import com.songhg.firefly.iot.system.mapper.TenantMapper;
import com.songhg.firefly.iot.system.mapper.TenantUsageDailyMapper;
import com.songhg.firefly.iot.system.mapper.TenantUsageRealtimeMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenantServiceTest {

    @Mock
    private TenantMapper tenantMapper;
    @Mock
    private TenantUsageRealtimeMapper usageRealtimeMapper;
    @Mock
    private TenantUsageDailyMapper usageDailyMapper;
    @Mock
    private UserMapper userMapper;
    @Mock
    private RoleMapper roleMapper;
    @Mock
    private RolePermissionMapper rolePermissionMapper;
    @Mock
    private UserRoleMapper userRoleMapper;
    @Mock
    private StringRedisTemplate redisTemplate;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private com.songhg.firefly.iot.common.event.EventPublisher eventPublisher;
    @Mock
    private UserDomainService userDomainService;
    @Mock
    private TenantMenuConfigService tenantMenuConfigService;
    @Mock
    private TenantOpenApiSubscriptionService tenantOpenApiSubscriptionService;
    @Mock
    private PermissionService permissionService;
    @Mock
    private WorkspacePermissionCatalogService workspacePermissionCatalogService;

    @InjectMocks
    private TenantService tenantService;

    @AfterEach
    void clearContext() {
        AppContextHolder.clear();
    }

    @Test
    void getTenantSpaceMenusShouldSwitchToManagedTenantContextAndKeepOperatorIdentity() {
        long platformTenantId = 1L;
        long managedTenantId = 2L;
        long operatorId = 99L;

        AppContext ctx = new AppContext();
        ctx.setTenantId(platformTenantId);
        ctx.setUserId(operatorId);
        ctx.setUsername("system-admin");
        ctx.setPlatform("WEB");
        AppContextHolder.set(ctx);

        Tenant tenant = new Tenant();
        tenant.setId(managedTenantId);
        when(tenantMapper.selectById(managedTenantId)).thenReturn(tenant);
        doNothing().when(userDomainService).assertCurrentUserIsSystemOps();
        when(userDomainService.isPlatformTenant(managedTenantId)).thenReturn(false);

        TenantSpaceMenuAuthorizationVO expected = new TenantSpaceMenuAuthorizationVO();
        when(tenantMenuConfigService.getTenantSpaceAuthorization(managedTenantId)).thenAnswer(invocation -> {
            assertThat(AppContextHolder.getTenantId()).isEqualTo(managedTenantId);
            assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
            assertThat(AppContextHolder.getUsername()).isEqualTo("system-admin");
            return expected;
        });

        TenantSpaceMenuAuthorizationVO result = tenantService.getTenantSpaceMenus(managedTenantId);

        assertThat(result).isSameAs(expected);
        assertThat(AppContextHolder.getTenantId()).isEqualTo(platformTenantId);
        assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
    }

    @Test
    void syncTenantRolePermissionsToAuthorizedScopeShouldUseManagedTenantContext() {
        long platformTenantId = 1L;
        long managedTenantId = 2L;
        long operatorId = 99L;
        long roleId = 10L;
        long userId = 200L;

        AppContext ctx = new AppContext();
        ctx.setTenantId(platformTenantId);
        ctx.setUserId(operatorId);
        ctx.setUsername("system-admin");
        AppContextHolder.set(ctx);

        Role role = new Role();
        role.setId(roleId);
        role.setTenantId(managedTenantId);
        role.setSystemFlag(true);

        UserRole userRole = new UserRole();
        userRole.setRoleId(roleId);
        userRole.setUserId(userId);

        when(workspacePermissionCatalogService.getTenantWorkspacePermissions(managedTenantId)).thenAnswer(invocation -> {
            assertThat(AppContextHolder.getTenantId()).isEqualTo(managedTenantId);
            assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
            return Set.of("user:read", "role:read");
        });
        when(roleMapper.selectList(any())).thenAnswer(invocation -> {
            assertThat(AppContextHolder.getTenantId()).isEqualTo(managedTenantId);
            assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
            return List.of(role);
        });
        when(userRoleMapper.selectList(any())).thenAnswer(invocation -> {
            assertThat(AppContextHolder.getTenantId()).isEqualTo(managedTenantId);
            return List.of(userRole);
        });
        when(rolePermissionMapper.selectList(any())).thenReturn(List.of());

        tenantService.syncTenantRolePermissionsToAuthorizedScope(managedTenantId);

        verify(rolePermissionMapper, times(1)).delete(any());
        verify(rolePermissionMapper, times(2)).insert(any(RolePermission.class));
        verify(permissionService).evictUserCache(userId);
        assertThat(AppContextHolder.getTenantId()).isEqualTo(platformTenantId);
        assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
    }

    @Test
    void updateTenantOpenApiSubscriptionsShouldSwitchToManagedTenantContextAndKeepOperatorIdentity() {
        long platformTenantId = 1L;
        long managedTenantId = 2L;
        long operatorId = 99L;

        AppContext ctx = new AppContext();
        ctx.setTenantId(platformTenantId);
        ctx.setUserId(operatorId);
        ctx.setUsername("system-admin");
        AppContextHolder.set(ctx);

        Tenant tenant = new Tenant();
        tenant.setId(managedTenantId);
        when(tenantMapper.selectById(managedTenantId)).thenReturn(tenant);
        doNothing().when(userDomainService).assertCurrentUserIsSystemOps();
        when(userDomainService.isPlatformTenant(managedTenantId)).thenReturn(false);

        List<TenantOpenApiSubscriptionVO> expected = List.of();
        when(tenantOpenApiSubscriptionService.replaceSubscriptions(eq(managedTenantId), isNull())).thenAnswer(invocation -> {
            assertThat(AppContextHolder.getTenantId()).isEqualTo(managedTenantId);
            assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
            return expected;
        });

        List<TenantOpenApiSubscriptionVO> result = tenantService.updateTenantOpenApiSubscriptions(managedTenantId, null);

        assertThat(result).isSameAs(expected);
        assertThat(AppContextHolder.getTenantId()).isEqualTo(platformTenantId);
        assertThat(AppContextHolder.getUserId()).isEqualTo(operatorId);
    }
}
