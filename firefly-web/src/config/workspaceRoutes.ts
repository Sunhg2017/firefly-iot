import routeConfigs, { isRouteGroup, type RouteEntry, type RouteItem } from './routes';

export type WorkspaceType = 'platform' | 'tenant';

export interface WorkspaceMenuConfigItem {
  routePath?: string | null;
  visible?: boolean;
  children?: WorkspaceMenuConfigItem[];
}

export const WORKSPACE_STORAGE_KEY = 'firefly_workspace';

const PLATFORM_GROUP_KEYS = new Set(['system-mgmt', 'security-audit']);
const TENANT_GROUP_KEYS = new Set(['project-mgmt', 'device-mgmt', 'rule-alarm', 'data-insight', 'ops-tools']);
const SHARED_PATHS = new Set(['/dashboard']);
const PLATFORM_PATHS = new Set(['/monitor']);
const ROUTE_PERMISSION_MAP = new Map<string, string>();

for (const entry of routeConfigs) {
  if (isRouteGroup(entry)) {
    for (const child of entry.children) {
      if (child.permission) {
        ROUTE_PERMISSION_MAP.set(child.path, child.permission);
      }
    }
  } else if (entry.permission) {
    ROUTE_PERMISSION_MAP.set(entry.path, entry.permission);
  }
}

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

export function filterWorkspaceRoutes(workspace: WorkspaceType): RouteEntry[] {
  const filtered: RouteEntry[] = [];
  for (const entry of routeConfigs) {
    if (isRouteGroup(entry)) {
      const children = entry.children.filter((child) => {
        const cls = classifyRouteItem(child, entry.key);
        return cls === 'shared' || cls === workspace;
      });
      if (children.length === 0) continue;
      filtered.push(children.length === entry.children.length ? entry : { ...entry, children });
      continue;
    }

    const cls = classifyRouteItem(entry);
    if (cls === 'shared' || cls === workspace) {
      filtered.push(entry);
    }
  }
  return filtered;
}

export function resolveWorkspaceByPath(pathname: string): WorkspaceType | null {
  if (pathname === '/menu-config') {
    return null;
  }
  for (const entry of routeConfigs) {
    if (isRouteGroup(entry)) {
      const child = entry.children.find((item) => item.path === pathname);
      if (child) {
        const cls = classifyRouteItem(child, entry.key);
        return cls === 'shared' ? null : cls;
      }
      continue;
    }
    if (entry.path === pathname) {
      const cls = classifyRouteItem(entry);
      return cls === 'shared' ? null : cls;
    }
  }
  return null;
}

export function collectWorkspacePaths(workspace: WorkspaceType): string[] {
  const paths: string[] = [];
  for (const entry of filterWorkspaceRoutes(workspace)) {
    if (isRouteGroup(entry)) {
      for (const child of entry.children) {
        paths.push(child.path);
      }
    } else {
      paths.push(entry.path);
    }
  }
  return [...new Set(paths)];
}

function hasRoutePermission(permission: string | undefined, permissions?: readonly string[] | null): boolean {
  if (!permission) {
    return true;
  }
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
  if (Array.isArray(menuConfig) && menuConfig.length > 0) {
    const configuredPaths = collectConfiguredPaths(menuConfig, permissions);
    if (configuredPaths.length === 0) {
      return '/403';
    }
    const nonDashboardPaths = configuredPaths.filter((path) => path !== '/dashboard');
    return nonDashboardPaths[0] || configuredPaths[0] || '/403';
  }

  if (permissions === undefined) {
    const candidates = collectWorkspacePaths(workspace).filter((path) => path !== '/dashboard');
    return candidates[0] || '/dashboard';
  }

  const accessiblePaths: string[] = [];
  for (const entry of filterWorkspaceRoutes(workspace)) {
    if (isRouteGroup(entry)) {
      for (const child of entry.children) {
        if (hasRoutePermission(child.permission, permissions)) {
          accessiblePaths.push(child.path);
        }
      }
      continue;
    }

    if (hasRoutePermission(entry.permission, permissions)) {
      accessiblePaths.push(entry.path);
    }
  }

  const uniquePaths = [...new Set(accessiblePaths)];
  if (uniquePaths.length === 0) {
    return '/403';
  }

  const nonDashboardPaths = uniquePaths.filter((path) => path !== '/dashboard');
  return nonDashboardPaths[0] || uniquePaths[0] || '/403';
}
