package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionGroupVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionOptionVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspacePermissionCatalogService {

    private enum WorkspaceScope {
        PLATFORM,
        TENANT,
        BOTH
    }

    private record PermissionDefinition(String code, String label) {
    }

    private record PermissionModule(
            String key,
            String label,
            String routePath,
            WorkspaceScope scope,
            boolean visibleInRoleCatalog,
            List<PermissionDefinition> permissions
    ) {
    }

    private static final String DASHBOARD_ROUTE = "/dashboard";

    private static final List<PermissionModule> MODULES = List.of(
            module("dashboard", "工作台", DASHBOARD_ROUTE, WorkspaceScope.BOTH, true,
                    permission("dashboard:read", "查看工作台")),

            module("tenant", "租户管理", "/tenant", WorkspaceScope.PLATFORM, true,
                    permission("tenant:read", "查看租户"),
                    permission("tenant:manage", "维护租户")),
            module("user", "用户管理", "/user", WorkspaceScope.BOTH, true,
                    permission("user:create", "创建用户"),
                    permission("user:read", "查看用户"),
                    permission("user:update", "编辑用户"),
                    permission("user:delete", "删除用户"),
                    permission("user:role:assign", "分配用户角色")),
            module("role", "角色管理", "/role", WorkspaceScope.BOTH, true,
                    permission("role:create", "创建角色"),
                    permission("role:read", "查看角色"),
                    permission("role:update", "编辑角色"),
                    permission("role:delete", "删除角色")),
            module("permission", "权限资源", "/permission", WorkspaceScope.PLATFORM, true,
                    permission("permission:create", "创建权限资源"),
                    permission("permission:read", "查看权限资源"),
                    permission("permission:update", "编辑权限资源"),
                    permission("permission:delete", "删除权限资源")),
            module("dict", "数据字典", "/dict", WorkspaceScope.PLATFORM, true,
                    permission("dict:create", "创建字典"),
                    permission("dict:read", "查看字典"),
                    permission("dict:update", "编辑字典"),
                    permission("dict:delete", "删除字典")),
            module("settings", "系统设置", "/settings", WorkspaceScope.PLATFORM, true,
                    permission("system:read", "查看系统设置"),
                    permission("system:update", "维护系统设置")),
            module("notification-channel", "通知渠道", "/notification", WorkspaceScope.PLATFORM, true,
                    permission("notification:read", "查看通知渠道"),
                    permission("notification:update", "维护通知渠道"),
                    permission("notification:delete", "删除通知渠道")),
            module("scheduled-task", "定时任务", "/scheduled-task", WorkspaceScope.PLATFORM, true,
                    permission("system:read", "查看定时任务"),
                    permission("system:update", "维护定时任务")),
            module("monitor", "系统监控", "/monitor", WorkspaceScope.PLATFORM, true,
                    permission("monitor:read", "查看系统监控")),
            module("api-key", "API Key", "/api-key", WorkspaceScope.PLATFORM, true,
                    permission("apikey:create", "创建 API Key"),
                    permission("apikey:read", "查看 API Key"),
                    permission("apikey:update", "编辑 API Key"),
                    permission("apikey:delete", "删除 API Key")),
            module("audit-log", "审计日志", "/audit-log", WorkspaceScope.PLATFORM, true,
                    permission("audit:read", "查看审计日志")),
            module("operation-log", "操作日志", "/operation-log", WorkspaceScope.PLATFORM, true,
                    permission("operation-log:read", "查看操作日志"),
                    permission("operation-log:delete", "清理操作日志")),

            module("project", "项目管理", "/project", WorkspaceScope.TENANT, true,
                    permission("project:create", "创建项目"),
                    permission("project:read", "查看项目"),
                    permission("project:update", "编辑项目"),
                    permission("project:delete", "删除项目")),
            module("share", "跨租户共享", "/share", WorkspaceScope.TENANT, true,
                    permission("share:create", "创建共享策略"),
                    permission("share:read", "查看共享策略"),
                    permission("share:update", "编辑共享策略"),
                    permission("share:delete", "删除共享策略"),
                    permission("share:approve", "审批共享策略")),
            module("product", "产品与物模型", "/product", WorkspaceScope.TENANT, true,
                    permission("product:create", "创建产品"),
                    permission("product:read", "查看产品"),
                    permission("product:update", "编辑产品"),
                    permission("product:delete", "删除产品"),
                    permission("product:publish", "发布产品")),
            module("protocol-parser", "协议解析", "/protocol-parser", WorkspaceScope.TENANT, true,
                    permission("protocol-parser:create", "创建协议解析"),
                    permission("protocol-parser:read", "查看协议解析"),
                    permission("protocol-parser:update", "编辑协议解析"),
                    permission("protocol-parser:test", "调试协议解析"),
                    permission("protocol-parser:publish", "发布协议解析")),
            module("device", "设备管理", "/device", WorkspaceScope.TENANT, true,
                    permission("device:create", "创建设备"),
                    permission("device:read", "查看设备"),
                    permission("device:update", "编辑设备"),
                    permission("device:delete", "删除设备"),
                    permission("device:control", "控制设备"),
                    permission("device:debug", "调试设备"),
                    permission("device:import", "导入设备"),
                    permission("device:export", "导出设备")),
            module("device-group", "设备分组", "/device-group", WorkspaceScope.TENANT, true,
                    permission("device-group:create", "创建分组"),
                    permission("device-group:read", "查看分组"),
                    permission("device-group:update", "编辑分组"),
                    permission("device-group:delete", "删除分组")),
            module("device-tag", "设备标签", "/device-tag", WorkspaceScope.TENANT, true,
                    permission("device-tag:create", "创建标签"),
                    permission("device-tag:read", "查看标签"),
                    permission("device-tag:update", "编辑标签"),
                    permission("device-tag:delete", "删除标签")),
            module("geo-fence", "地理围栏", "/geo-fence", WorkspaceScope.TENANT, true,
                    permission("geo-fence:create", "创建围栏"),
                    permission("geo-fence:read", "查看围栏"),
                    permission("geo-fence:update", "编辑围栏"),
                    permission("geo-fence:delete", "删除围栏")),
            module("device-shadow", "设备影子", "/device-shadow", WorkspaceScope.TENANT, true,
                    permission("device:read", "查看设备影子"),
                    permission("device:update", "编辑设备影子"),
                    permission("device:delete", "删除设备影子")),
            module("device-message", "设备消息", "/device-message", WorkspaceScope.TENANT, true,
                    permission("device:read", "查看设备消息"),
                    permission("device:control", "下发设备消息")),
            module("snmp", "SNMP 接入", "/snmp", WorkspaceScope.TENANT, false,
                    permission("device:read", "查看设备接入")),
            module("modbus", "Modbus 接入", "/modbus", WorkspaceScope.TENANT, false,
                    permission("device:read", "查看设备接入")),
            module("websocket", "WebSocket 接入", "/websocket", WorkspaceScope.TENANT, false,
                    permission("device:read", "查看设备接入")),
            module("tcp-udp", "TCP/UDP 接入", "/tcp-udp", WorkspaceScope.TENANT, false,
                    permission("device:read", "查看设备接入")),
            module("lorawan", "LoRaWAN 接入", "/lorawan", WorkspaceScope.TENANT, false,
                    permission("device:read", "查看设备接入")),
            module("rule-engine", "规则引擎", "/rule-engine", WorkspaceScope.TENANT, true,
                    permission("rule:create", "创建规则"),
                    permission("rule:read", "查看规则"),
                    permission("rule:update", "编辑规则"),
                    permission("rule:delete", "删除规则"),
                    permission("rule:enable", "启停规则")),
            module("alarm-rules", "告警规则", "/alarm-rules", WorkspaceScope.TENANT, true,
                    permission("alarm:create", "创建告警规则"),
                    permission("alarm:read", "查看告警规则"),
                    permission("alarm:update", "编辑告警规则"),
                    permission("alarm:delete", "删除告警规则")),
            module("alarm-recipient-groups", "告警接收组", "/alarm-recipient-groups", WorkspaceScope.TENANT, true,
                    permission("alarm:read", "查看接收组"),
                    permission("alarm:update", "维护接收组")),
            module("alarm-records", "告警处理", "/alarm-records", WorkspaceScope.TENANT, true,
                    permission("alarm:read", "查看告警记录"),
                    permission("alarm:confirm", "确认告警"),
                    permission("alarm:process", "处理告警")),
            module("notification-records", "通知记录", "/notification-records", WorkspaceScope.TENANT, true,
                    permission("notification:read", "查看通知记录")),
            module("message-template", "消息模板", "/message-template", WorkspaceScope.TENANT, true,
                    permission("message-template:create", "创建消息模板"),
                    permission("message-template:read", "查看消息模板"),
                    permission("message-template:update", "编辑消息模板"),
                    permission("message-template:delete", "删除消息模板")),
            module("device-data", "设备数据", "/device-data", WorkspaceScope.TENANT, true,
                    permission("data:read", "查看设备数据")),
            module("analysis", "数据分析", "/analysis", WorkspaceScope.TENANT, true,
                    permission("analysis:read", "查看分析结果"),
                    permission("analysis:export", "导出分析结果")),
            module("device-log", "设备日志", "/device-log", WorkspaceScope.TENANT, true,
                    permission("device-log:read", "查看设备日志"),
                    permission("device-log:delete", "清理设备日志")),
            module("export", "异步任务", "/export", WorkspaceScope.TENANT, true,
                    permission("export:create", "创建异步任务"),
                    permission("export:read", "查看异步任务"),
                    permission("export:update", "取消异步任务"),
                    permission("export:delete", "清理异步任务")),
            module("firmware", "固件管理", "/firmware", WorkspaceScope.TENANT, true,
                    permission("firmware:read", "查看固件绑定"),
                    permission("firmware:update", "维护固件绑定")),
            module("ota", "OTA 升级", "/ota", WorkspaceScope.TENANT, true,
                    permission("ota:read", "查看 OTA"),
                    permission("ota:upload", "上传固件"),
                    permission("ota:deploy", "下发升级"),
                    permission("ota:delete", "删除固件或任务")),
            module("video", "视频监控", "/video", WorkspaceScope.TENANT, true,
                    permission("video:create", "创建视频设备"),
                    permission("video:read", "查看视频设备"),
                    permission("video:update", "编辑视频设备"),
                    permission("video:delete", "删除视频设备"),
                    permission("video:stream", "推拉流与截图"),
                    permission("video:ptz", "云台控制"),
                    permission("video:record", "录像控制"))
    );

    private final UserDomainService userDomainService;
    private final TenantMenuConfigService tenantMenuConfigService;

    public List<RolePermissionGroupVO> listAssignablePermissionGroupsForCurrentWorkspace() {
        Long tenantId = requireTenantId();
        boolean platformTenant = userDomainService.isPlatformTenant(tenantId);
        Set<String> allowedPermissions = platformTenant
                ? getPlatformWorkspacePermissions()
                : getTenantWorkspacePermissions(tenantId);

        List<RolePermissionGroupVO> groups = new ArrayList<>();
        for (PermissionModule module : MODULES) {
            if (!module.visibleInRoleCatalog) {
                continue;
            }
            if (!belongsToWorkspace(module.scope, platformTenant)) {
                continue;
            }

            List<RolePermissionOptionVO> options = module.permissions.stream()
                    .filter(permission -> allowedPermissions.contains(permission.code))
                    .map(permission -> {
                        RolePermissionOptionVO option = new RolePermissionOptionVO();
                        option.setCode(permission.code);
                        option.setLabel(permission.label);
                        return option;
                    })
                    .toList();
            if (options.isEmpty()) {
                continue;
            }

            RolePermissionGroupVO group = new RolePermissionGroupVO();
            group.setKey(module.key);
            group.setLabel(module.label);
            group.setRoutePath(module.routePath);
            group.setPermissions(options);
            groups.add(group);
        }
        return groups;
    }

    public Set<String> getAssignablePermissionsForCurrentWorkspace() {
        Long tenantId = requireTenantId();
        return userDomainService.isPlatformTenant(tenantId)
                ? getPlatformWorkspacePermissions()
                : getTenantWorkspacePermissions(tenantId);
    }

    public Set<String> getTenantWorkspacePermissions(Long tenantId) {
        Set<String> allowed = new LinkedHashSet<>(getBaselinePermissions());
        Set<String> authorizedPaths = getTenantAuthorizedRoutePaths(tenantId);

        for (PermissionModule module : MODULES) {
            if (module.scope == WorkspaceScope.PLATFORM) {
                continue;
            }
            if (DASHBOARD_ROUTE.equals(module.routePath) || authorizedPaths.contains(module.routePath)) {
                module.permissions.stream()
                        .map(PermissionDefinition::code)
                        .forEach(allowed::add);
            }
        }
        return allowed;
    }

    public Set<String> getPlatformWorkspacePermissions() {
        Set<String> allowed = new LinkedHashSet<>();
        for (PermissionModule module : MODULES) {
            if (module.scope == WorkspaceScope.TENANT) {
                continue;
            }
            module.permissions.stream()
                    .map(PermissionDefinition::code)
                    .forEach(allowed::add);
        }
        return allowed;
    }

    public void validateAssignablePermissions(Collection<String> requestedPermissions) {
        Set<String> requested = normalizePermissions(requestedPermissions);
        if (requested.isEmpty()) {
            return;
        }

        Set<String> allowed = getAssignablePermissionsForCurrentWorkspace();
        List<String> invalid = requested.stream()
                .filter(permission -> !allowed.contains(permission))
                .toList();
        if (!invalid.isEmpty()) {
            throw new BizException(ResultCode.PERMISSION_DENIED,
                    "存在未授权的权限项: " + String.join(", ", invalid));
        }
    }

    public Set<String> retainTenantAuthorizedPermissions(Long tenantId, Collection<String> permissions) {
        Set<String> requested = normalizePermissions(permissions);
        if (requested.isEmpty()) {
            return requested;
        }
        Set<String> allowed = getTenantWorkspacePermissions(tenantId);
        requested.retainAll(allowed);
        return requested;
    }

    public Set<String> normalizePermissions(Collection<String> permissions) {
        Set<String> normalized = new LinkedHashSet<>();
        if (permissions == null) {
            return normalized;
        }
        for (String permission : permissions) {
            if (StringUtils.hasText(permission)) {
                normalized.add(permission.trim());
            }
        }
        return normalized;
    }

    private Set<String> getBaselinePermissions() {
        return Set.of("dashboard:read");
    }

    private Set<String> getTenantAuthorizedRoutePaths(Long tenantId) {
        List<MenuConfigVO> menuConfigs = tenantMenuConfigService.getMenuList(tenantId);
        Set<String> paths = new LinkedHashSet<>();
        for (MenuConfigVO item : menuConfigs) {
            if (Boolean.FALSE.equals(item.getVisible())) {
                continue;
            }
            if (StringUtils.hasText(item.getRoutePath())) {
                paths.add(item.getRoutePath().trim());
            }
        }
        return paths;
    }

    private boolean belongsToWorkspace(WorkspaceScope scope, boolean platformTenant) {
        return switch (scope) {
            case BOTH -> true;
            case PLATFORM -> platformTenant;
            case TENANT -> !platformTenant;
        };
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private static PermissionModule module(
            String key,
            String label,
            String routePath,
            WorkspaceScope scope,
            boolean visibleInRoleCatalog,
            PermissionDefinition... permissions
    ) {
        return new PermissionModule(key, label, routePath, scope, visibleInRoleCatalog, List.of(permissions));
    }

    private static PermissionDefinition permission(String code, String label) {
        return new PermissionDefinition(code, label);
    }
}
