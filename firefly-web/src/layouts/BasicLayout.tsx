import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Breadcrumb, Tag } from 'antd';
import {
  AppstoreOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReconciliationOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import useAuthStore from '../store/useAuthStore';
import type { MenuConfigItem } from '../store/useAuthStore';
import NotificationDropdown from '../components/NotificationDropdown';
import ExportCenterDropdown from '../components/ExportCenterDropdown';
import routeConfigs, {
  DEVICE_PROTOCOL_GROUP_KEY,
  isRouteGroup,
  type RouteEntry,
  type RouteItem,
  type RouteNode,
} from '../config/routes';
import { getIcon } from '../config/iconMap';
import {
  filterWorkspaceRoutes,
  getWorkspaceHomePath,
  isConfiguredMenuPathAllowed,
  resolveWorkspaceByUserType,
  resolveWorkspaceByPath,
  type WorkspaceType,
  WORKSPACE_STORAGE_KEY,
} from '../config/workspaceRoutes';

type MenuItem = Required<MenuProps>['items'][number];
type BreadcrumbNode = { title: string; path?: string };
type RoutePermission = RouteItem['permission'];
const PROTOCOL_ROUTE_PATHS = new Set(['/snmp', '/modbus', '/websocket', '/tcp-udp', '/lorawan']);
const SYNTHETIC_ID_BASE = -1_000_000;

const { Header, Sider, Content } = Layout;

const permissionMap = new Map<string, RoutePermission>();

const routePathMeta = new Map<string, { label: string; icon: React.ReactNode }>();
const routeGroupMeta = new Map<string, { label: string; icon: React.ReactNode }>();

const walkRouteNodes = (
  nodes: RouteNode[],
  visitor: (node: RouteNode, ancestors: RouteEntry[]) => void,
  ancestors: RouteEntry[] = [],
) => {
  for (const node of nodes) {
    visitor(node, ancestors);
    if (isRouteGroup(node)) {
      walkRouteNodes(node.children, visitor, [...ancestors, node]);
    }
  }
};

walkRouteNodes(routeConfigs, (node) => {
  if (isRouteGroup(node)) {
    routeGroupMeta.set(node.key, { label: node.label, icon: node.icon });
    return;
  }
  routePathMeta.set(node.path, { label: node.label, icon: node.icon });
  if (node.permission) {
    permissionMap.set(node.path, node.permission);
  }
});

function normalizePath(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('/') ? path : `/${path}`;
}

function getCanonicalMenuLabel(menuKey: string, routePath: string | null, fallback: string): string {
  const normalizedPath = normalizePath(routePath);
  if (normalizedPath && routePathMeta.has(normalizedPath)) {
    return routePathMeta.get(normalizedPath)!.label;
  }
  if (routeGroupMeta.has(menuKey)) {
    return routeGroupMeta.get(menuKey)!.label;
  }
  if (menuKey === DEVICE_PROTOCOL_GROUP_KEY) {
    return '协议接入';
  }
  return fallback;
}

function getCanonicalMenuIcon(menuKey: string, routePath: string | null, fallback: string | null) {
  const normalizedPath = normalizePath(routePath);
  if (normalizedPath && routePathMeta.has(normalizedPath)) {
    const entry = routePathMeta.get(normalizedPath);
    return guessIconName(entry?.icon) ?? fallback;
  }
  if (routeGroupMeta.has(menuKey)) {
    const entry = routeGroupMeta.get(menuKey);
    return guessIconName(entry?.icon) ?? fallback;
  }
  return fallback;
}

function guessIconName(icon: React.ReactNode): string | null {
  if (!icon || typeof icon !== 'object' || !('type' in icon)) {
    return null;
  }
  const iconType = (icon as { type?: { displayName?: string; name?: string } }).type;
  return iconType?.displayName || iconType?.name || null;
}

function loadWorkspaceCache(): WorkspaceType {
  const cached = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return cached === 'platform' || cached === 'tenant' ? cached : 'tenant';
}

function persistWorkspace(workspace: WorkspaceType) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
}

const BasicLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasAnyPermission, menuConfig } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceType>(loadWorkspaceCache);
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>([]);
  const enforcedWorkspace = useMemo(
    () => resolveWorkspaceByUserType(user?.userType),
    [user?.userType],
  );

  const routeEntries = useMemo(() => filterWorkspaceRoutes(workspace), [workspace]);
  const userPermissions = useMemo(
    () => (Array.isArray(user?.permissions) ? user.permissions : []),
    [user?.permissions],
  );
  const canManageWorkspaceMenus = user?.workspaceMenuAdmin === true;
  const menuManageGroupKey = workspace === 'platform' ? 'platform-space-manage' : 'tenant-space-manage';
  const menuManageGroupLabel = workspace === 'platform' ? '空间管理' : '空间设置';
  const menuManageGroupIcon = workspace === 'platform' ? <SettingOutlined /> : <AppstoreOutlined />;

  const hasRoutePermission = (permission?: RoutePermission): boolean => {
    if (!permission) {
      return true;
    }
    // Some menu entries are shared by multiple operational roles, so the route can accept any one permission.
    return Array.isArray(permission)
      ? hasAnyPermission(...permission)
      : hasPermission(permission);
  };

  const canAccessPath = (path: string | null): boolean => {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) return true;
    const perm = permissionMap.get(normalizedPath);
    return hasRoutePermission(perm);
  };

  const canAccess = (item: RouteItem): boolean => {
    return hasRoutePermission(item.permission);
  };

  const normalizeTenantMenuConfig = (items: MenuConfigItem[] | null): MenuConfigItem[] | null => {
    if (!Array.isArray(items) || items.length === 0) {
      return items;
    }

    let syntheticId = SYNTHETIC_ID_BASE;
    const walk = (nodes: MenuConfigItem[]): MenuConfigItem[] =>
      nodes
        .map((node) => {
          const normalizedPath = normalizePath(node.routePath);
          const children = Array.isArray(node.children) ? walk(node.children) : [];
          const normalizedNode: MenuConfigItem = {
            ...node,
            label: getCanonicalMenuLabel(node.menuKey, normalizedPath, node.label),
            icon: getCanonicalMenuIcon(node.menuKey, normalizedPath, node.icon),
            routePath: normalizedPath,
            children,
          };

          if (node.menuKey !== 'device-mgmt') {
            return normalizedNode;
          }

          const directChildren = [...children];
          const existingProtocolGroup = directChildren.find((child) => child.menuKey === DEVICE_PROTOCOL_GROUP_KEY) || null;
          const extractedProtocolChildren = directChildren.filter((child) => {
            const childPath = normalizePath(child.routePath);
            return !!childPath && PROTOCOL_ROUTE_PATHS.has(childPath);
          });

          if (extractedProtocolChildren.length === 0 && !existingProtocolGroup) {
            return normalizedNode;
          }

          // Existing tenant menus may still store protocol entries flat under device-mgmt.
          // We fold them into a synthetic protocol group so old menu config can render using the new hierarchy.
          const remainingChildren = directChildren.filter((child) => {
            const childPath = normalizePath(child.routePath);
            return child.menuKey !== DEVICE_PROTOCOL_GROUP_KEY && !(childPath && PROTOCOL_ROUTE_PATHS.has(childPath));
          });
          const mergedProtocolChildren = [
            ...(existingProtocolGroup?.children ?? []),
            ...extractedProtocolChildren,
          ].sort((a, b) => a.sortOrder - b.sortOrder);

          const protocolGroup: MenuConfigItem = existingProtocolGroup
            ? {
                ...existingProtocolGroup,
                label: getCanonicalMenuLabel(existingProtocolGroup.menuKey, null, existingProtocolGroup.label),
                icon: getCanonicalMenuIcon(existingProtocolGroup.menuKey, null, existingProtocolGroup.icon),
                routePath: null,
                children: mergedProtocolChildren,
              }
            : {
                id: syntheticId--,
                parentId: normalizedNode.id,
                menuKey: DEVICE_PROTOCOL_GROUP_KEY,
                label: getCanonicalMenuLabel(DEVICE_PROTOCOL_GROUP_KEY, null, '协议接入'),
                icon: getCanonicalMenuIcon(DEVICE_PROTOCOL_GROUP_KEY, null, 'ApiOutlined'),
                routePath: null,
                sortOrder: 98,
                visible: true,
                children: mergedProtocolChildren,
              };

          return {
            ...normalizedNode,
            children: [...remainingChildren, protocolGroup].sort((a, b) => a.sortOrder - b.sortOrder),
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

    return walk(items);
  };

  const normalizedMenuConfig = useMemo(() => normalizeTenantMenuConfig(menuConfig), [menuConfig]);

  const buildTenantMenu = (items: MenuConfigItem[]): MenuItem[] => {
    const buildNodes = (nodes: MenuConfigItem[]): MenuItem[] =>
      nodes.flatMap((node) => {
        if (!node.visible) {
          return [];
        }
        const normalizedPath = normalizePath(node.routePath);
        if (normalizedPath && !canAccessPath(normalizedPath)) {
          return [];
        }

        const children = Array.isArray(node.children) ? buildNodes(node.children) : [];
        if (!normalizedPath && children.length === 0) {
          return [];
        }

        return [{
          key: normalizedPath || node.menuKey,
          icon: getIcon(node.icon),
          label: node.label,
          children: children.length > 0 ? children : undefined,
        }];
      });

    return buildNodes(items);
  };

  const buildDefaultMenu = (entries: RouteEntry[]): MenuItem[] => {
    const buildNodes = (nodes: RouteNode[]): MenuItem[] =>
      nodes.flatMap((node) => {
        if (isRouteGroup(node)) {
          const children = buildNodes(node.children);
          if (children.length === 0) {
            return [];
          }
          return [{
            key: node.key,
            icon: node.icon,
            label: node.label,
            children,
          }];
        }

        if (!canAccess(node)) {
          return [];
        }
        return [{
          key: node.path,
          icon: node.icon,
          label: node.label,
        }];
      });

    return buildNodes(entries);
  };

  const menuItems: MenuItem[] = useMemo(() => {
    const items = normalizedMenuConfig && normalizedMenuConfig.length > 0
      ? buildTenantMenu(normalizedMenuConfig)
      : buildDefaultMenu(routeEntries);

    if (!canManageWorkspaceMenus || items.some((item) => (item as { key?: string })?.key === menuManageGroupKey)) {
      return items;
    }

    return [
      ...items,
      {
        key: menuManageGroupKey,
        icon: menuManageGroupIcon,
        label: menuManageGroupLabel,
        children: [
          {
            key: '/menu-config',
            icon: <ReconciliationOutlined />,
            label: '菜单管理',
          },
        ],
      },
    ];
  }, [workspace, normalizedMenuConfig, routeEntries, canManageWorkspaceMenus, menuManageGroupIcon, menuManageGroupKey, menuManageGroupLabel, hasPermission]);

  const currentPathAccessible = useMemo(
    () => {
      if (location.pathname === '/403') {
        return true;
      }
      if (location.pathname === '/menu-config') {
        return user?.workspaceMenuAdmin === true;
      }
      if (!canAccessPath(location.pathname)) {
        return false;
      }
      const routeWorkspace = resolveWorkspaceByPath(location.pathname);
      if (routeWorkspace === workspace && normalizedMenuConfig && normalizedMenuConfig.length > 0) {
        return isConfiguredMenuPathAllowed(location.pathname, normalizedMenuConfig, userPermissions);
      }
      return true;
    },
    [location.pathname, workspace, normalizedMenuConfig, userPermissions, user, hasPermission],
  );

  const openKeys = useMemo(() => {
    if (location.pathname === '/menu-config' && canManageWorkspaceMenus) {
      return [menuManageGroupKey];
    }

    const findMenuTrail = (nodes: MenuConfigItem[], trail: string[] = []): string[] | null => {
      for (const node of nodes) {
        const nextTrail = node.routePath ? trail : [...trail, node.menuKey];
        if (normalizePath(node.routePath) === location.pathname) {
          return nextTrail;
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          const found = findMenuTrail(node.children, nextTrail);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };

    if (normalizedMenuConfig && normalizedMenuConfig.length > 0) {
      return findMenuTrail(normalizedMenuConfig) ?? [];
    }

    const findRouteTrail = (nodes: RouteNode[], trail: string[] = []): string[] | null => {
      for (const node of nodes) {
        if (isRouteGroup(node)) {
          const found = findRouteTrail(node.children, [...trail, node.key]);
          if (found) {
            return found;
          }
          continue;
        }
        if (node.path === location.pathname) {
          return trail;
        }
      }
      return null;
    };

    return findRouteTrail(routeEntries) ?? [];
  }, [workspace, routeEntries, location.pathname, normalizedMenuConfig, canManageWorkspaceMenus, menuManageGroupKey]);

  useEffect(() => {
    setMenuOpenKeys(openKeys);
  }, [openKeys]);

  const findBreadcrumbFromMenuConfig = (
    nodes: MenuConfigItem[],
    trail: BreadcrumbNode[] = [],
  ): BreadcrumbNode[] | null => {
    for (const node of nodes) {
      const normalizedPath = normalizePath(node.routePath);
      const nextTrail = normalizedPath
        ? [...trail, { title: node.label }]
        : [...trail, { title: node.label }];

      if (normalizedPath === location.pathname) {
        return nextTrail;
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        const found = findBreadcrumbFromMenuConfig(node.children, nextTrail);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const findBreadcrumbFromRoutes = (
    nodes: RouteNode[],
    trail: BreadcrumbNode[] = [],
  ): BreadcrumbNode[] | null => {
    for (const node of nodes) {
      if (isRouteGroup(node)) {
        const found = findBreadcrumbFromRoutes(node.children, [...trail, { title: node.label }]);
        if (found) {
          return found;
        }
        continue;
      }
      if (node.path === location.pathname) {
        return [...trail, { title: node.label }];
      }
    }
    return null;
  };

  const breadcrumbItems = useMemo<BreadcrumbNode[]>(() => {
    const items: BreadcrumbNode[] = [];
    if (canAccessPath('/dashboard')) {
      items.push({ title: '工作台', path: '/dashboard' });
    }

    if (location.pathname === '/dashboard') {
      return items;
    }

    if (location.pathname === '/menu-config' && user?.workspaceMenuAdmin) {
      items.push({ title: menuManageGroupLabel });
      items.push({ title: '菜单管理' });
      return items;
    }

    if (normalizedMenuConfig && normalizedMenuConfig.length > 0) {
      const found = findBreadcrumbFromMenuConfig(normalizedMenuConfig);
      if (found) {
        items.push(...found);
        return items;
      }
    }

    const routeBreadcrumb = findBreadcrumbFromRoutes(routeEntries);
    if (routeBreadcrumb) {
      items.push(...routeBreadcrumb);
      return items;
    }

    return items;
  }, [workspace, routeEntries, location.pathname, normalizedMenuConfig, menuManageGroupLabel, user, hasPermission]);

  useEffect(() => {
    const byPath = resolveWorkspaceByPath(location.pathname);
    if (byPath && byPath !== enforcedWorkspace) {
      navigate(
        getWorkspaceHomePath(
          enforcedWorkspace,
          userPermissions,
          enforcedWorkspace === 'tenant' ? normalizedMenuConfig : undefined,
        ),
        { replace: true },
      );
      return;
    }
    if (workspace !== enforcedWorkspace) {
      setWorkspace(enforcedWorkspace);
      persistWorkspace(enforcedWorkspace);
    }
  }, [location.pathname, workspace, enforcedWorkspace, navigate, userPermissions, normalizedMenuConfig]);

  const handleMenuClick = (e: { key: string }) => {
    const path = normalizePath(e.key);
    if (!path) return;
    navigate(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const dropdownItems = {
    items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
          borderRight: 'none',
          overflow: 'hidden',
        }}
        trigger={null}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 20px',
            gap: 12,
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>F</span>
          </div>
          {!collapsed && (
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
              }}
            >
              Firefly IoT
            </span>
          )}
        </div>

        <div style={{ overflow: 'auto', height: 'calc(100vh - 64px)', padding: '8px 8px' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            openKeys={collapsed ? [] : menuOpenKeys}
            onOpenChange={(keys) => setMenuOpenKeys(keys as string[])}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.75)',
            }}
            theme="dark"
          />
        </div>
      </Sider>
      <Layout style={{ background: '#f5f7fa' }}>
        <Header
          style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(12px)',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
            zIndex: 10,
            position: 'sticky',
            top: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              onClick={() => setCollapsed(!collapsed)}
              style={{
                cursor: 'pointer',
                fontSize: 18,
                color: '#64748b',
                padding: '4px 8px',
                borderRadius: 6,
                transition: 'color 0.2s, background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#4f46e5';
                e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>

            <Tag color={workspace === 'platform' ? 'geekblue' : 'green'}>
              {workspace === 'platform' ? '系统运维空间' : '租户业务空间'}
            </Tag>

            <Breadcrumb
              separator="/"
              items={breadcrumbItems.map((item, index) => {
                const isLast = index === breadcrumbItems.length - 1;
                const clickable = !!item.path && !isLast && item.path !== location.pathname;
                return {
                  title: clickable ? (
                    <span
                      onClick={() => navigate(item.path!)}
                      style={{ color: '#94a3b8', cursor: 'pointer' }}
                    >
                      {item.title}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: isLast ? '#334155' : '#94a3b8',
                        fontWeight: isLast ? 500 : 400,
                      }}
                    >
                      {item.title}
                    </span>
                  ),
                };
              })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationDropdown />
            <ExportCenterDropdown />
            <Dropdown menu={dropdownItems}>
              <Space
                style={{
                  cursor: 'pointer',
                  padding: '4px 12px',
                  borderRadius: 8,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar
                  icon={<UserOutlined />}
                  src={user?.avatarUrl}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  }}
                />
                <span style={{ fontWeight: 500, color: '#334155' }}>
                  {user?.realName || user?.username || '用户'}
                </span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: 20,
            padding: 24,
            background: '#ffffff',
            borderRadius: 16,
            minHeight: 360,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          {currentPathAccessible ? <Outlet /> : <Navigate to="/403" replace />}
        </Content>
      </Layout>
    </Layout>
  );
};

export default BasicLayout;
