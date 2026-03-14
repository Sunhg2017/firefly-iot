import routeConfigs, {
  isRouteGroup,
  type RouteEntry,
  type RouteItem,
  type RouteNode,
  type WorkspaceScope,
} from './routes';

export type WorkspaceType = 'platform' | 'tenant';

export const WORKSPACE_STORAGE_KEY = 'firefly_workspace';

type RoutePermission = RouteItem['permission'];

const SHARED_PATHS = new Set<string>();
const ROUTE_PERMISSION_MAP = new Map<string, RoutePermission>();
const ROUTE_SCOPE_MAP = new Map<string, WorkspaceScope>();

function normalizePath(path?: string | null): string | null {
  if (!path) {
    return null;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function walkRouteNodes(nodes: RouteNode[], visitor: (item: RouteItem) => void) {
  for (const node of nodes) {
    if (isRouteGroup(node)) {
      walkRouteNodes(node.children, visitor);
      continue;
    }
    visitor(node);
  }
}

walkRouteNodes(routeConfigs, (item) => {
  const path = normalizePath(item.path);
  if (!path) {
    return;
  }
  ROUTE_PERMISSION_MAP.set(path, item.permission);
  ROUTE_SCOPE_MAP.set(path, item.workspace);
  if (item.workspace === 'both') {
    SHARED_PATHS.add(path);
  }
});

function belongsToWorkspace(scope: WorkspaceScope, workspace: WorkspaceType): boolean {
  return scope === 'both' || scope === workspace;
}

function filterRouteNodes(nodes: RouteNode[], workspace: WorkspaceType, exact = false): RouteNode[] {
  const filtered: RouteNode[] = [];
  for (const node of nodes) {
    if (isRouteGroup(node)) {
      const children = filterRouteNodes(node.children, workspace, exact);
      const groupMatches = exact ? node.workspace === workspace : belongsToWorkspace(node.workspace, workspace);
      if (!groupMatches && children.length === 0) {
        continue;
      }
      if (children.length === 0) {
        continue;
      }
      filtered.push(children.length === node.children.length ? node : { ...node, children });
      continue;
    }

    const routeMatches = exact ? node.workspace === workspace : belongsToWorkspace(node.workspace, workspace);
    if (routeMatches) {
      filtered.push(node);
    }
  }
  return filtered;
}

function hasSinglePermission(permission: string, permissions?: readonly string[] | null): boolean {
  if (permissions === undefined) {
    return true;
  }

  const granted = Array.isArray(permissions)
    ? permissions.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  if (granted.includes('*') || granted.includes(permission)) {
    return true;
  }
  const resource = permission.split(':')[0];
  return granted.includes(`${resource}:*`);
}

function hasMenuPathAccess(pathname: string, authorizedMenuPaths?: readonly string[] | null): boolean {
  if (authorizedMenuPaths === undefined || authorizedMenuPaths === null) {
    return true;
  }
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath) {
    return false;
  }
  const allowedPaths = Array.isArray(authorizedMenuPaths)
    ? authorizedMenuPaths.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  if (allowedPaths.length === 0) {
    return false;
  }
  return allowedPaths.includes(normalizedPath);
}

export function hasRoutePermission(permission?: RoutePermission, permissions?: readonly string[] | null): boolean {
  if (!permission) {
    return true;
  }
  return Array.isArray(permission)
    ? permission.some((item) => hasSinglePermission(item, permissions))
    : hasSinglePermission(permission, permissions);
}

export function filterWorkspaceRoutes(workspace: WorkspaceType): RouteEntry[] {
  return filterRouteNodes(routeConfigs, workspace);
}

export function filterWorkspaceExclusiveRoutes(workspace: WorkspaceType): RouteEntry[] {
  return filterRouteNodes(routeConfigs, workspace, true);
}

export function filterSharedRoutes(): RouteEntry[] {
  return routeConfigs.flatMap((node) => {
    if (isRouteGroup(node)) {
      return [];
    }
    return node.workspace === 'both' ? [node] : [];
  });
}

export function isSharedWorkspacePath(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  return normalizedPath ? SHARED_PATHS.has(normalizedPath) : false;
}

export function resolveWorkspaceByPath(pathname: string): WorkspaceType | null {
  const scope = ROUTE_SCOPE_MAP.get(normalizePath(pathname) || '');
  if (scope === 'platform') {
    return 'platform';
  }
  if (scope === 'tenant') {
    return 'tenant';
  }
  return null;
}

export function resolveWorkspaceByUserType(userType?: string | null): WorkspaceType {
  return userType === 'SYSTEM_OPS' ? 'platform' : 'tenant';
}

export function isWorkspacePathAllowed(
  pathname: string,
  permissions?: readonly string[] | null,
  authorizedMenuPaths?: readonly string[] | null,
): boolean {
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath) {
    return false;
  }
  if (!ROUTE_SCOPE_MAP.has(normalizedPath)) {
    return false;
  }
  return hasRoutePermission(ROUTE_PERMISSION_MAP.get(normalizedPath), permissions)
    && hasMenuPathAccess(normalizedPath, authorizedMenuPaths);
}

export function getWorkspaceHomePath(
  workspace: WorkspaceType,
  permissions?: readonly string[] | null,
  authorizedMenuPaths?: readonly string[] | null,
): string {
  const candidates: string[] = [];
  walkRouteNodes(filterWorkspaceRoutes(workspace), (item) => {
    const path = normalizePath(item.path);
    if (path && hasRoutePermission(item.permission, permissions) && hasMenuPathAccess(path, authorizedMenuPaths)) {
      candidates.push(path);
    }
  });

  const uniquePaths = [...new Set(candidates)];
  const nonDashboard = uniquePaths.filter((path) => path !== '/dashboard');
  return nonDashboard[0] || uniquePaths[0] || '/403';
}
