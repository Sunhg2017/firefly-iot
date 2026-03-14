import routeConfigs, { isRouteGroup, type RouteEntry, type RouteItem, type RouteNode } from './routes';

export type WorkspaceType = 'platform' | 'tenant';

export interface WorkspaceMenuConfigItem {
  routePath?: string | null;
  visible?: boolean;
  children?: WorkspaceMenuConfigItem[];
}

export const WORKSPACE_STORAGE_KEY = 'firefly_workspace';

const PLATFORM_GROUP_KEYS = new Set(['system-mgmt', 'security-audit']);
const TENANT_GROUP_KEYS = new Set(['project-mgmt', 'device-mgmt', 'rule-alarm', 'data-insight', 'ops-tools']);
const SHARED_PATHS = new Set(['/dashboard', '/user']);
const PLATFORM_PATHS = new Set(['/monitor']);
export const TENANT_USER_GROUP_KEY = 'tenant-user-space';
export const TENANT_USER_GROUP_LABEL = '组织与用户';
const USER_MANAGEMENT_PATH = '/user';
type RoutePermission = RouteItem['permission'];

const ROUTE_PERMISSION_MAP = new Map<string, RoutePermission>();

const walkRouteNodes = (
  nodes: RouteNode[],
  visitor: (item: RouteItem, rootGroupKey?: string) => void,
  rootGroupKey?: string,
) => {
  for (const node of nodes) {
    if (isRouteGroup(node)) {
      walkRouteNodes(node.children, visitor, rootGroupKey ?? node.key);
      continue;
    }
    visitor(node, rootGroupKey);
  }
};

walkRouteNodes(routeConfigs, (item) => {
  if (item.permission) {
    ROUTE_PERMISSION_MAP.set(item.path, item.permission);
  }
});

type WorkspaceClass = WorkspaceType | 'shared';

function normalizePath(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('/') ? path : `/${path}`;
}

function classifyGroup(groupKey: string): WorkspaceType {
  if (PLATFORM_GROUP_KEYS.has(groupKey)) return 'platform';
  if (TENANT_GROUP_KEYS.has(groupKey)) return 'tenant';
  return 'tenant';
}

function classifyRouteItem(item: RouteItem, groupKey?: string): WorkspaceClass {
  if (SHARED_PATHS.has(item.path)) return 'shared';
  if (PLATFORM_PATHS.has(item.path)) return 'platform';
  if (groupKey) return classifyGroup(groupKey);
  return 'tenant';
}

function filterRouteNodes(
  nodes: RouteNode[],
  workspace: WorkspaceType,
  rootGroupKey?: string,
): RouteNode[] {
  const filtered: RouteNode[] = [];
  for (const node of nodes) {
    if (isRouteGroup(node)) {
      const children = filterRouteNodes(node.children, workspace, rootGroupKey ?? node.key);
      if (children.length === 0) {
        continue;
      }
      if (workspace === 'tenant' && node.key === 'system-mgmt') {
        const userChildren = children.filter(
          (item): item is RouteItem => !isRouteGroup(item) && item.path === USER_MANAGEMENT_PATH,
        );
        if (userChildren.length > 0) {
          filtered.push({
            ...node,
            key: TENANT_USER_GROUP_KEY,
            label: TENANT_USER_GROUP_LABEL,
            children: userChildren,
          });
        }
        continue;
      }
      filtered.push(children.length === node.children.length ? node : { ...node, children });
      continue;
    }

    const cls = classifyRouteItem(node, rootGroupKey);
    if (cls === 'shared' || cls === workspace) {
      filtered.push(node);
    }
  }
  return filtered;
}

export function filterWorkspaceRoutes(workspace: WorkspaceType): RouteEntry[] {
  return filterRouteNodes(routeConfigs, workspace);
}

export function resolveWorkspaceByPath(pathname: string): WorkspaceType | null {
  if (pathname === '/menu-config') {
    return null;
  }
  let resolved: WorkspaceType | null = null;
  walkRouteNodes(routeConfigs, (item, rootGroupKey) => {
    if (item.path !== pathname || resolved !== null) {
      return;
    }
    const cls = classifyRouteItem(item, rootGroupKey);
    resolved = cls === 'shared' ? null : cls;
  });
  if (resolved !== null) {
    return resolved;
  }
  return null;
}

export function collectWorkspacePaths(workspace: WorkspaceType): string[] {
  const paths: string[] = [];
  walkRouteNodes(filterWorkspaceRoutes(workspace), (item) => {
    paths.push(item.path);
  });
  return [...new Set(paths)];
}

function hasSinglePermission(permission: string, permissions?: readonly string[] | null): boolean {
  if (permissions === undefined) {
    return true;
  }

  const grantedPermissions = Array.isArray(permissions)
    ? permissions.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

  if (grantedPermissions.includes('*') || grantedPermissions.includes(permission)) {
    return true;
  }

  const resource = permission.split(':')[0];
  return grantedPermissions.includes(`${resource}:*`);
}

function hasRoutePermission(permission: RoutePermission, permissions?: readonly string[] | null): boolean {
  if (!permission) {
    return true;
  }
  return Array.isArray(permission)
    ? permission.some((item) => hasSinglePermission(item, permissions))
    : hasSinglePermission(permission, permissions);
}

function collectConfiguredPaths(
  items?: readonly WorkspaceMenuConfigItem[] | null,
  permissions?: readonly string[] | null,
): string[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const result: string[] = [];
  for (const item of items) {
    if (item?.visible === false) {
      continue;
    }

    const routePath = normalizePath(item?.routePath);
    if (routePath && hasRoutePermission(ROUTE_PERMISSION_MAP.get(routePath), permissions)) {
      result.push(routePath);
    }

    if (Array.isArray(item?.children) && item.children.length > 0) {
      result.push(...collectConfiguredPaths(item.children, permissions));
    }
  }

  return [...new Set(result)];
}

export function resolveWorkspaceByUserType(userType?: string | null): WorkspaceType {
  return userType === 'SYSTEM_OPS' ? 'platform' : 'tenant';
}

export function isConfiguredMenuPathAllowed(
  pathname: string,
  menuConfig?: readonly WorkspaceMenuConfigItem[] | null,
  permissions?: readonly string[] | null,
): boolean {
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath) {
    return false;
  }
  return new Set(collectConfiguredPaths(menuConfig, permissions)).has(normalizedPath);
}

export function getWorkspaceHomePath(
  workspace: WorkspaceType,
  permissions?: readonly string[] | null,
  menuConfig?: readonly WorkspaceMenuConfigItem[] | null,
): string {
  const preferTenantHomePath = (paths: string[]) => {
    if (workspace !== 'tenant') {
      return paths[0] || '/403';
    }
    const nonUserPaths = paths.filter((path) => path !== '/user');
    return nonUserPaths[0] || paths[0] || '/403';
  };

  if (Array.isArray(menuConfig) && menuConfig.length > 0) {
    const configuredPaths = collectConfiguredPaths(menuConfig, permissions);
    if (configuredPaths.length === 0) {
      if (workspace === 'tenant') {
        const fallbackPaths = collectWorkspacePaths(workspace).filter((path) => path !== '/dashboard');
        if (permissions === undefined) {
          return preferTenantHomePath(fallbackPaths.length > 0 ? fallbackPaths : ['/dashboard']);
        }

        const accessiblePaths: string[] = [];
        walkRouteNodes(filterWorkspaceRoutes(workspace), (item) => {
          if (hasRoutePermission(item.permission, permissions)) {
            accessiblePaths.push(item.path);
          }
        });

        const uniqueFallbackPaths = [...new Set(accessiblePaths)].filter((path) => path !== '/dashboard');
        return preferTenantHomePath(uniqueFallbackPaths.length > 0 ? uniqueFallbackPaths : ['/dashboard']);
      }
      return '/403';
    }
    const nonDashboardPaths = configuredPaths.filter((path) => path !== '/dashboard');
    return preferTenantHomePath(nonDashboardPaths.length > 0 ? nonDashboardPaths : configuredPaths);
  }

  if (permissions === undefined) {
    const candidates = collectWorkspacePaths(workspace).filter((path) => path !== '/dashboard');
    return preferTenantHomePath(candidates.length > 0 ? candidates : ['/dashboard']);
  }

  const accessiblePaths: string[] = [];
  walkRouteNodes(filterWorkspaceRoutes(workspace), (item) => {
    if (hasRoutePermission(item.permission, permissions)) {
      accessiblePaths.push(item.path);
    }
  });

  const uniquePaths = [...new Set(accessiblePaths)];
  if (uniquePaths.length === 0) {
    return '/403';
  }

  const nonDashboardPaths = uniquePaths.filter((path) => path !== '/dashboard');
  return preferTenantHomePath(nonDashboardPaths.length > 0 ? nonDashboardPaths : uniquePaths);
}
