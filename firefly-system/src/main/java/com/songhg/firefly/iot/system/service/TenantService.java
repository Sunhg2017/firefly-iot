package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.TenantEvent;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import com.songhg.firefly.iot.common.enums.TenantPlan;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.tenant.*;
import com.songhg.firefly.iot.system.entity.Tenant;
import com.songhg.firefly.iot.system.entity.TenantQuota;
import com.songhg.firefly.iot.system.entity.TenantUsageDaily;
import com.songhg.firefly.iot.system.entity.TenantUsageRealtime;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.RolePermission;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.convert.TenantConvert;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAuthorizationVO;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import com.songhg.firefly.iot.system.mapper.TenantMapper;
import com.songhg.firefly.iot.system.mapper.TenantQuotaMapper;
import com.songhg.firefly.iot.system.mapper.TenantUsageDailyMapper;
import com.songhg.firefly.iot.system.mapper.TenantUsageRealtimeMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantMapper tenantMapper;
    private final TenantQuotaMapper tenantQuotaMapper;
    private final TenantUsageRealtimeMapper usageRealtimeMapper;
    private final TenantUsageDailyMapper usageDailyMapper;
    private final UserMapper userMapper;
    private final RoleMapper roleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final UserRoleMapper userRoleMapper;
    private final StringRedisTemplate redisTemplate;
    private final PasswordEncoder passwordEncoder;
    private final EventPublisher eventPublisher;
    private final UserDomainService userDomainService;
    private final TenantMenuConfigService tenantMenuConfigService;
    private final PermissionService permissionService;
    private final WorkspacePermissionCatalogService workspacePermissionCatalogService;

    @Transactional
    public TenantVO createTenant(TenantCreateDTO dto) {
        assertSystemOpsOperator();

        // Check code uniqueness
        Long count = tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>()
                        .eq(Tenant::getCode, dto.getCode())
                        .isNull(Tenant::getDeletedAt));
        if (count > 0) {
            throw new BizException(ResultCode.TENANT_CODE_EXISTS);
        }

        // Create tenant
        Tenant tenant = TenantConvert.INSTANCE.toEntity(dto);
        if (tenant.getPlan() == null) {
            tenant.setPlan(TenantPlan.FREE);
        }
        tenant.setStatus(TenantStatus.INITIALIZING);
        if (tenant.getIsolationLevel() == null) {
            tenant.setIsolationLevel(IsolationLevel.SHARED_RLS);
        }
        tenant.setIsolationConfig("{}");
        tenantMapper.insert(tenant);

        Long operatorId = AppContextHolder.getUserId();
        Long adminUserId = withTenantContext(tenant.getId(), () -> {
            TenantQuota quota = createQuotaForPlan(tenant.getId(), tenant.getPlan());
            tenantQuotaMapper.insert(quota);
            // Tenant workspace menus are now granted only by explicit system-ops authorization.
            return createTenantAdmin(tenant, dto.getAdminUser(), operatorId);
        });
        tenant.setAdminUserId(adminUserId);

        log.info("Tenant created: id={}, code={}, plan={}", tenant.getId(), tenant.getCode(), tenant.getPlan());

        // Set to ACTIVE (will be async via Kafka in production)
        tenant.setStatus(TenantStatus.ACTIVE);
        tenantMapper.updateById(tenant);

        // Publish event
        eventPublisher.publish(EventTopics.TENANT_EVENTS,
                TenantEvent.created(tenant.getId(), tenant.getCode(), operatorId));

        return TenantConvert.INSTANCE.toVO(tenant);
    }

    public TenantVO getTenantById(Long id) {
        Tenant tenant = tenantMapper.selectById(id);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        return TenantConvert.INSTANCE.toVO(tenant);
    }

    public TenantVO getTenantByCode(String code) {
        assertSystemOpsOperator();
        Tenant tenant = tenantMapper.selectOne(
                new LambdaQueryWrapper<Tenant>()
                        .eq(Tenant::getCode, code)
                        .isNull(Tenant::getDeletedAt));
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        return TenantConvert.INSTANCE.toVO(tenant);
    }

    public IPage<TenantVO> listTenants(TenantQueryDTO query) {
        assertSystemOpsOperator();
        LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Tenant::getName, query.getKeyword())
                    .or().like(Tenant::getCode, query.getKeyword()));
        }
        if (query.getPlan() != null) {
            wrapper.eq(Tenant::getPlan, query.getPlan());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Tenant::getStatus, query.getStatus());
        }
        wrapper.isNull(Tenant::getDeletedAt);
        wrapper.orderByDesc(Tenant::getCreatedAt);

        Page<Tenant> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<Tenant> result = tenantMapper.selectPage(page, wrapper);
        return result.convert(TenantConvert.INSTANCE::toVO);
    }

    @Transactional
    public TenantVO updateTenant(Long id, TenantUpdateDTO dto) {
        Tenant tenant = tenantMapper.selectById(id);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        TenantConvert.INSTANCE.updateEntity(dto, tenant);
        tenantMapper.updateById(tenant);

        // Invalidate cache
        evictTenantCache(id);

        return TenantConvert.INSTANCE.toVO(tenant);
    }

    @Transactional
    public void updateTenantStatus(Long id, TenantStatus status, String reason) {
        assertSystemOpsOperator();
        Tenant tenant = tenantMapper.selectById(id);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        TenantStatus oldStatus = tenant.getStatus();
        tenant.setStatus(status);
        if (TenantStatus.SUSPENDED == status) {
            tenant.setSuspendedAt(LocalDateTime.now());
            tenant.setSuspendedReason(reason);
        } else if (TenantStatus.ACTIVE == status) {
            tenant.setSuspendedAt(null);
            tenant.setSuspendedReason(null);
        }
        tenantMapper.updateById(tenant);
        evictTenantCache(id);
        log.info("Tenant status changed: id={}, status={}", id, status);

        // Publish event
        Long operatorId = AppContextHolder.getUserId();
        eventPublisher.publish(EventTopics.TENANT_EVENTS,
                TenantEvent.statusChanged(id, tenant.getCode(),
                        oldStatus != null ? oldStatus.getValue() : null,
                        status.getValue(), operatorId));
    }

    public AppContext loadTenantContext(Long tenantId) {
        // Try Redis cache first
        String cacheKey = AuthConstants.REDIS_TENANT_CTX + tenantId;
        // For simplicity, load from DB (in production, check Redis L2 first)
        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        if (tenant.getStatus() != TenantStatus.ACTIVE && tenant.getStatus() != TenantStatus.MAINTENANCE) {
            throw new BizException(ResultCode.TENANT_DISABLED, "租户状态异常: " + tenant.getStatus());
        }

        AppContext ctx = new AppContext();
        ctx.setTenantId(tenant.getId());
        ctx.setTenantCode(tenant.getCode());
        ctx.setPlan(tenant.getPlan());
        ctx.setIsolationLevel(tenant.getIsolationLevel());

        // Cache to Redis
        redisTemplate.opsForValue().set(cacheKey, tenant.getId().toString(), 30, TimeUnit.MINUTES);

        return ctx;
    }

    private void evictTenantCache(Long tenantId) {
        redisTemplate.delete(AuthConstants.REDIS_TENANT_CTX + tenantId);
    }

    private TenantQuota createQuotaForPlan(Long tenantId, TenantPlan plan) {
        TenantQuota quota = new TenantQuota();
        quota.setTenantId(tenantId);
        switch (plan) {
            case STANDARD -> {
                quota.setMaxDevices(10000);
                quota.setMaxMsgPerSec(10000);
                quota.setMaxRules(100);
                quota.setDataRetentionDays(90);
                quota.setMaxOtaStorageGb(50);
                quota.setMaxApiCallsDay(1000000);
                quota.setMaxUsers(50);
                quota.setMaxProjects(10);
                quota.setMaxVideoChannels(100);
                quota.setMaxVideoStorageGb(500);
                quota.setMaxSharePolicies(5);
            }
            case ENTERPRISE -> {
                quota.setMaxDevices(-1);
                quota.setMaxMsgPerSec(-1);
                quota.setMaxRules(-1);
                quota.setDataRetentionDays(-1);
                quota.setMaxOtaStorageGb(-1);
                quota.setMaxApiCallsDay(-1);
                quota.setMaxUsers(-1);
                quota.setMaxProjects(-1);
                quota.setMaxVideoChannels(-1);
                quota.setMaxVideoStorageGb(-1);
                quota.setMaxSharePolicies(-1);
            }
            default -> { // FREE
                quota.setMaxDevices(100);
                quota.setMaxMsgPerSec(100);
                quota.setMaxRules(10);
                quota.setDataRetentionDays(7);
                quota.setMaxOtaStorageGb(1);
                quota.setMaxApiCallsDay(10000);
                quota.setMaxUsers(5);
                quota.setMaxProjects(1);
                quota.setMaxVideoChannels(5);
                quota.setMaxVideoStorageGb(10);
                quota.setMaxSharePolicies(0);
            }
        }
        quota.setCustomConfig("{}");
        quota.setUpdatedAt(LocalDateTime.now());
        return quota;
    }

    // ==================== Plan Management ====================

    @Transactional
    public TenantVO updatePlan(Long tenantId, TenantPlan newPlan) {
        assertSystemOpsOperator();
        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        TenantPlan oldPlan = tenant.getPlan();
        tenant.setPlan(newPlan);
        tenantMapper.updateById(tenant);

        withTenantContext(tenantId, () -> {
            TenantQuota quota = tenantQuotaMapper.selectOne(
                    new LambdaQueryWrapper<TenantQuota>().eq(TenantQuota::getTenantId, tenantId));
            if (quota != null) {
                TenantQuota newQuota = createQuotaForPlan(tenantId, newPlan);
                newQuota.setId(quota.getId());
                tenantQuotaMapper.updateById(newQuota);
            }
            return null;
        });

        evictTenantCache(tenantId);
        log.info("Tenant plan updated: id={}, {} -> {}", tenantId, oldPlan, newPlan);

        Long operatorId = AppContextHolder.getUserId();
        eventPublisher.publish(EventTopics.TENANT_EVENTS,
                TenantEvent.statusChanged(tenantId, tenant.getCode(),
                        oldPlan != null ? oldPlan.name() : null, newPlan.name(), operatorId));

        return TenantConvert.INSTANCE.toVO(tenant);
    }

    // ==================== Quota Management ====================

    public TenantQuotaVO getQuota(Long tenantId) {
        return withTenantContext(tenantId, () -> {
            TenantQuota quota = ensureTenantQuota(tenantId);
            TenantQuotaVO vo = new TenantQuotaVO();
            vo.setTenantId(quota.getTenantId());
            vo.setMaxDevices(quota.getMaxDevices());
            vo.setMaxMsgPerSec(quota.getMaxMsgPerSec());
            vo.setMaxRules(quota.getMaxRules());
            vo.setDataRetentionDays(quota.getDataRetentionDays());
            vo.setMaxOtaStorageGb(quota.getMaxOtaStorageGb());
            vo.setMaxApiCallsDay(quota.getMaxApiCallsDay());
            vo.setMaxUsers(quota.getMaxUsers());
            vo.setMaxProjects(quota.getMaxProjects());
            vo.setMaxVideoChannels(quota.getMaxVideoChannels());
            vo.setMaxVideoStorageGb(quota.getMaxVideoStorageGb());
            vo.setMaxSharePolicies(quota.getMaxSharePolicies());
            return vo;
        });
    }

    @Transactional
    public TenantQuotaVO updateQuota(Long tenantId, TenantQuotaUpdateDTO dto) {
        return withTenantContext(tenantId, () -> {
            TenantQuota quota = ensureTenantQuota(tenantId);
            if (dto.getMaxDevices() != null) quota.setMaxDevices(dto.getMaxDevices());
            if (dto.getMaxMsgPerSec() != null) quota.setMaxMsgPerSec(dto.getMaxMsgPerSec());
            if (dto.getMaxRules() != null) quota.setMaxRules(dto.getMaxRules());
            if (dto.getDataRetentionDays() != null) quota.setDataRetentionDays(dto.getDataRetentionDays());
            if (dto.getMaxOtaStorageGb() != null) quota.setMaxOtaStorageGb(dto.getMaxOtaStorageGb());
            if (dto.getMaxApiCallsDay() != null) quota.setMaxApiCallsDay(dto.getMaxApiCallsDay());
            if (dto.getMaxUsers() != null) quota.setMaxUsers(dto.getMaxUsers());
            if (dto.getMaxProjects() != null) quota.setMaxProjects(dto.getMaxProjects());
            if (dto.getMaxVideoChannels() != null) quota.setMaxVideoChannels(dto.getMaxVideoChannels());
            if (dto.getMaxVideoStorageGb() != null) quota.setMaxVideoStorageGb(dto.getMaxVideoStorageGb());
            if (dto.getMaxSharePolicies() != null) quota.setMaxSharePolicies(dto.getMaxSharePolicies());
            quota.setUpdatedAt(LocalDateTime.now());
            tenantQuotaMapper.updateById(quota);
            log.info("Tenant quota updated: tenantId={}", tenantId);
            return getQuota(tenantId);
        });
    }

    private TenantQuota ensureTenantQuota(Long tenantId) {
        TenantQuota quota = tenantQuotaMapper.selectOne(
                new LambdaQueryWrapper<TenantQuota>().eq(TenantQuota::getTenantId, tenantId));
        if (quota != null) {
            return quota;
        }

        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null || tenant.getDeletedAt() != null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }

        TenantQuota created = createQuotaForPlan(tenantId, tenant.getPlan() != null ? tenant.getPlan() : TenantPlan.FREE);
        try {
            tenantQuotaMapper.insert(created);
            return created;
        } catch (DuplicateKeyException ex) {
            // Another request may create quota concurrently.
            TenantQuota existing = tenantQuotaMapper.selectOne(
                    new LambdaQueryWrapper<TenantQuota>().eq(TenantQuota::getTenantId, tenantId));
            if (existing != null) {
                return existing;
            }
            throw ex;
        }
    }

    // ==================== Usage ====================

    public TenantUsageVO getUsage(Long tenantId) {
        return withTenantContext(tenantId, () -> {
            TenantUsageRealtime usage = usageRealtimeMapper.selectById(tenantId);
            TenantUsageVO vo = new TenantUsageVO();
            if (usage != null) {
                vo.setDeviceCount(usage.getDeviceCount());
                vo.setDeviceOnlineCount(usage.getDeviceOnlineCount());
                vo.setCurrentMsgRate(usage.getCurrentMsgRate());
                vo.setRuleCount(usage.getRuleCount());
                vo.setApiCallsToday(usage.getApiCallsToday());
                vo.setOtaStorageBytes(usage.getOtaStorageBytes());
                vo.setVideoChannelActive(usage.getVideoChannelActive());
                vo.setVideoStorageBytes(usage.getVideoStorageBytes());
                vo.setUserCount(usage.getUserCount());
                vo.setProjectCount(usage.getProjectCount());
                vo.setSharePolicyCount(usage.getSharePolicyCount());
                vo.setUpdatedAt(usage.getUpdatedAt());
            }
            return vo;
        });
    }

    public List<TenantUsageDailyVO> getUsageDaily(Long tenantId, LocalDate startDate, LocalDate endDate) {
        return withTenantContext(tenantId, () -> {
            LambdaQueryWrapper<TenantUsageDaily> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(TenantUsageDaily::getTenantId, tenantId);
            if (startDate != null) {
                wrapper.ge(TenantUsageDaily::getDate, startDate);
            }
            if (endDate != null) {
                wrapper.le(TenantUsageDaily::getDate, endDate);
            }
            wrapper.orderByAsc(TenantUsageDaily::getDate);

            return usageDailyMapper.selectList(wrapper).stream().map(d -> {
                TenantUsageDailyVO vo = new TenantUsageDailyVO();
                vo.setDate(d.getDate());
                vo.setDeviceCount(d.getDeviceCount());
                vo.setDeviceOnlinePeak(d.getDeviceOnlinePeak());
                vo.setMessageCount(d.getMessageCount());
                vo.setMessageRatePeak(d.getMessageRatePeak());
                vo.setRuleCount(d.getRuleCount());
                vo.setApiCallCount(d.getApiCallCount());
                vo.setStorageBytes(d.getStorageBytes());
                vo.setVideoChannelCount(d.getVideoChannelCount());
                vo.setVideoStorageBytes(d.getVideoStorageBytes());
                return vo;
            }).collect(Collectors.toList());
        });
    }

    public TenantQuotaUsageVO getQuotaAndUsage(Long tenantId) {
        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        TenantQuotaUsageVO vo = new TenantQuotaUsageVO();
        vo.setPlan(tenant.getPlan());
        vo.setQuotas(getQuota(tenantId));
        vo.setUsage(getUsage(tenantId));
        return vo;
    }

    // ==================== Deactivate ====================

    @Transactional
    public void deactivateTenant(Long tenantId) {
        assertSystemOpsOperator();
        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        tenant.setStatus(TenantStatus.DEACTIVATING);
        tenantMapper.updateById(tenant);
        tenantMapper.deleteById(tenant.getId());
        evictTenantCache(tenantId);
        log.info("Tenant deactivated: id={}, code={}", tenantId, tenant.getCode());

        Long operatorId = AppContextHolder.getUserId();
        eventPublisher.publish(EventTopics.TENANT_EVENTS,
                TenantEvent.statusChanged(tenantId, tenant.getCode(),
                        tenant.getStatus().getValue(), TenantStatus.DEACTIVATING.getValue(), operatorId));
    }

    // ==================== Overview ====================

    public TenantOverviewVO getOverview() {
        assertSystemOpsOperator();
        TenantOverviewVO vo = new TenantOverviewVO();
        vo.setTotalTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().isNull(Tenant::getDeletedAt)));
        vo.setActiveTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().eq(Tenant::getStatus, TenantStatus.ACTIVE).isNull(Tenant::getDeletedAt)));
        vo.setSuspendedTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().eq(Tenant::getStatus, TenantStatus.SUSPENDED).isNull(Tenant::getDeletedAt)));
        vo.setFreeTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().eq(Tenant::getPlan, TenantPlan.FREE).isNull(Tenant::getDeletedAt)));
        vo.setStandardTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().eq(Tenant::getPlan, TenantPlan.STANDARD).isNull(Tenant::getDeletedAt)));
        vo.setEnterpriseTenants(tenantMapper.selectCount(
                new LambdaQueryWrapper<Tenant>().eq(Tenant::getPlan, TenantPlan.ENTERPRISE).isNull(Tenant::getDeletedAt)));
        return vo;
    }

    public TenantSpaceMenuAuthorizationVO getTenantSpaceMenus(Long tenantId) {
        assertSystemOpsOperator();
        Tenant tenant = requireTenant(tenantId);
        ensureTenantSupportsSpaceAuthorization(tenant);
        return tenantMenuConfigService.getTenantSpaceAuthorization(tenantId);
    }

    @Transactional
    public TenantSpaceMenuAuthorizationVO updateTenantSpaceMenus(Long tenantId, TenantSpaceMenuAssignDTO items) {
        assertSystemOpsOperator();
        Tenant tenant = requireTenant(tenantId);
        ensureTenantSupportsSpaceAuthorization(tenant);
        if (items == null || items.getMenuKeys() == null || items.getMenuKeys().isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "请至少选择一个租户空间功能");
        }
        TenantSpaceMenuAuthorizationVO menuTree = tenantMenuConfigService.replaceMenus(tenantId, items.getMenuKeys());
        syncTenantRolePermissionsToAuthorizedScope(tenantId);
        return menuTree;
    }

    private Long createTenantAdmin(Tenant tenant, TenantCreateDTO.AdminUserDTO adminUser, Long operatorId) {
        Long tenantId = tenant.getId();
        Role adminRole = ensureTenantAdminRole(tenant);
        syncTenantAdminPermissions(
                adminRole.getId(),
                new ArrayList<>(workspacePermissionCatalogService.getTenantWorkspacePermissions(tenantId)));

        Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, adminUser.getUsername())
                .isNull(User::getDeletedAt));
        if (existing != null && existing > 0) {
            throw new BizException(ResultCode.USER_EXISTS, "tenant admin username already exists globally");
        }

        User user = new User();
        user.setTenantId(tenantId);
        user.setUsername(adminUser.getUsername());
        user.setPhone(adminUser.getPhone());
        user.setEmail(adminUser.getEmail());
        user.setRealName(resolveTenantAdminDisplayName(tenant));
        user.setUserType(UserType.TENANT_USER);
        user.setStatus(UserStatus.ACTIVE);
        user.setLoginFailCount(0);
        user.setPasswordHash(passwordEncoder.encode(adminUser.getPassword()));
        user.setPasswordChangedAt(LocalDateTime.now());
        user.setCreatedBy(operatorId);
        userMapper.insert(user);

        UserRole userRole = new UserRole();
        userRole.setUserId(user.getId());
        userRole.setRoleId(adminRole.getId());
        userRole.setCreatedAt(LocalDateTime.now());
        userRoleMapper.insert(userRole);

        Tenant persistedTenant = tenantMapper.selectById(tenantId);
        persistedTenant.setAdminUserId(user.getId());
        tenantMapper.updateById(persistedTenant);
        return user.getId();
    }

    private String resolveTenantAdminDisplayName(Tenant tenant) {
        if (StringUtils.hasText(tenant.getDisplayName())) {
            return tenant.getDisplayName().trim();
        }
        if (StringUtils.hasText(tenant.getName())) {
            return tenant.getName().trim();
        }
        return tenant.getCode();
    }

    private Tenant requireTenant(Long tenantId) {
        Tenant tenant = tenantMapper.selectById(tenantId);
        if (tenant == null || tenant.getDeletedAt() != null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        return tenant;
    }

    private void ensureTenantSupportsSpaceAuthorization(Tenant tenant) {
        if (userDomainService.isPlatformTenant(tenant.getId())) {
            throw new BizException(ResultCode.PARAM_ERROR, "系统运维租户不支持租户空间授权");
        }
    }

    private Role ensureTenantAdminRole(Tenant tenant) {
        Long tenantId = tenant.getId();
        String roleCode = tenant.getCode();
        String roleName = tenant.getName();
        Role role = roleMapper.selectOne(new LambdaQueryWrapper<Role>()
                .eq(Role::getTenantId, tenantId)
                .eq(Role::getCode, roleCode)
                .last("LIMIT 1"));
        if (role != null) {
            return role;
        }

        Role created = new Role();
        created.setTenantId(tenantId);
        created.setCode(roleCode);
        created.setName(roleName);
        created.setDescription("Auto created tenant admin role");
        created.setType(RoleType.PRESET);
        created.setDataScope(DataScopeType.ALL);
        created.setSystemFlag(true);
        created.setStatus(RoleStatus.ACTIVE);
        created.setCreatedBy(AppContextHolder.getUserId());
        roleMapper.insert(created);
        return created;
    }

    private void syncTenantAdminPermissions(Long roleId, List<String> permissionList) {
        Set<String> permissions = new LinkedHashSet<>();
        List<String> source = permissionList == null ? List.of() : permissionList;
        for (String permission : source) {
            if (StringUtils.hasText(permission)) {
                permissions.add(permission.trim());
            }
        }
        rolePermissionMapper.delete(new LambdaQueryWrapper<RolePermission>()
                .eq(RolePermission::getRoleId, roleId));
        for (String permission : permissions) {
            RolePermission rolePermission = new RolePermission();
            rolePermission.setRoleId(roleId);
            rolePermission.setPermission(permission);
            rolePermission.setCreatedAt(LocalDateTime.now());
            rolePermissionMapper.insert(rolePermission);
        }
    }

    public void syncTenantRolePermissionsToAuthorizedScope(Long tenantId) {
        Set<String> allowedPermissions = workspacePermissionCatalogService.getTenantWorkspacePermissions(tenantId);
        List<Role> roles = roleMapper.selectList(new LambdaQueryWrapper<Role>()
                .eq(Role::getTenantId, tenantId));
        if (roles.isEmpty()) {
            return;
        }

        Map<Long, List<UserRole>> userRolesByRoleId = userRoleMapper.selectList(new LambdaQueryWrapper<UserRole>()
                        .in(UserRole::getRoleId, roles.stream().map(Role::getId).toList()))
                .stream()
                .collect(Collectors.groupingBy(UserRole::getRoleId));

        for (Role role : roles) {
            Set<String> currentPermissions = rolePermissionMapper.selectList(new LambdaQueryWrapper<RolePermission>()
                            .eq(RolePermission::getRoleId, role.getId()))
                    .stream()
                    .map(RolePermission::getPermission)
                    .filter(permission -> permission != null && !permission.isBlank())
                    .collect(Collectors.toCollection(LinkedHashSet::new));

            Set<String> nextPermissions = Boolean.TRUE.equals(role.getSystemFlag())
                    ? new LinkedHashSet<>(allowedPermissions)
                    : workspacePermissionCatalogService.retainTenantAuthorizedPermissions(tenantId, currentPermissions);
            if (currentPermissions.equals(nextPermissions)) {
                continue;
            }

            rolePermissionMapper.delete(new LambdaQueryWrapper<RolePermission>()
                    .eq(RolePermission::getRoleId, role.getId()));
            for (String permission : nextPermissions) {
                RolePermission rolePermission = new RolePermission();
                rolePermission.setRoleId(role.getId());
                rolePermission.setPermission(permission);
                rolePermission.setCreatedAt(LocalDateTime.now());
                rolePermissionMapper.insert(rolePermission);
            }

            for (UserRole userRole : userRolesByRoleId.getOrDefault(role.getId(), List.of())) {
                permissionService.evictUserCache(userRole.getUserId());
            }
        }
    }

    public void syncAllTenantRolePermissionsToAuthorizedScope() {
        Long platformTenantId = userDomainService.getPlatformTenantId();
        List<Tenant> tenants = tenantMapper.selectList(new LambdaQueryWrapper<Tenant>()
                .select(Tenant::getId)
                .isNull(Tenant::getDeletedAt));
        for (Tenant tenant : tenants) {
            if (tenant == null || tenant.getId() == null || tenant.getId().equals(platformTenantId)) {
                continue;
            }
            syncTenantRolePermissionsToAuthorizedScope(tenant.getId());
        }
    }

    public void syncPlatformRolePermissionsToAuthorizedScope() {
        Long platformTenantId = userDomainService.getPlatformTenantId();
        Set<String> allowedPermissions = workspacePermissionCatalogService.getPlatformWorkspacePermissions();
        List<Role> roles = roleMapper.selectList(new LambdaQueryWrapper<Role>()
                .eq(Role::getTenantId, platformTenantId));
        if (roles.isEmpty()) {
            return;
        }

        Map<Long, List<UserRole>> userRolesByRoleId = userRoleMapper.selectList(new LambdaQueryWrapper<UserRole>()
                        .in(UserRole::getRoleId, roles.stream().map(Role::getId).toList()))
                .stream()
                .collect(Collectors.groupingBy(UserRole::getRoleId));

        for (Role role : roles) {
            Set<String> currentPermissions = rolePermissionMapper.selectList(new LambdaQueryWrapper<RolePermission>()
                            .eq(RolePermission::getRoleId, role.getId()))
                    .stream()
                    .map(RolePermission::getPermission)
                    .filter(permission -> permission != null && !permission.isBlank())
                    .collect(Collectors.toCollection(LinkedHashSet::new));

            Set<String> nextPermissions = Boolean.TRUE.equals(role.getSystemFlag())
                    ? new LinkedHashSet<>(allowedPermissions)
                    : new LinkedHashSet<>(currentPermissions);
            nextPermissions.retainAll(allowedPermissions);
            if (Boolean.TRUE.equals(role.getSystemFlag())) {
                nextPermissions = new LinkedHashSet<>(allowedPermissions);
            }

            if (currentPermissions.equals(nextPermissions)) {
                continue;
            }

            rolePermissionMapper.delete(new LambdaQueryWrapper<RolePermission>()
                    .eq(RolePermission::getRoleId, role.getId()));
            for (String permission : nextPermissions) {
                RolePermission rolePermission = new RolePermission();
                rolePermission.setRoleId(role.getId());
                rolePermission.setPermission(permission);
                rolePermission.setCreatedAt(LocalDateTime.now());
                rolePermissionMapper.insert(rolePermission);
            }

            for (UserRole userRole : userRolesByRoleId.getOrDefault(role.getId(), List.of())) {
                permissionService.evictUserCache(userRole.getUserId());
            }
        }
    }

    private void assertSystemOpsOperator() {
        userDomainService.assertCurrentUserIsSystemOps();
    }

    private <T> T withTenantContext(Long tenantId, Supplier<T> supplier) {
        AppContext previous = AppContextHolder.get();
        AppContext temp = new AppContext();
        temp.setTenantId(tenantId);
        AppContextHolder.set(temp);
        try {
            return supplier.get();
        } finally {
            if (previous != null) {
                AppContextHolder.set(previous);
            } else {
                AppContextHolder.clear();
            }
        }
    }

}
