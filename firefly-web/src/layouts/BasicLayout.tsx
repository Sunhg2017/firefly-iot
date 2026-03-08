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
import routeConfigs, { isRouteGroup, type RouteEntry, type RouteItem } from '../config/routes';
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

const { Header, Sider, Content } = Layout;

const permissionMap = new Map<string, string>();
for (const entry of routeConfigs) {
  if (isRouteGroup(entry)) {
    for (const child of entry.children) {
      if (child.permission) permissionMap.set(child.path, child.permission);
    }
  } else if (entry.permission) {
    permissionMap.set(entry.path, entry.permission);
  }
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
  const { user, logout, hasPermission, menuConfig } = useAuthStore();
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

  const normalizePath = (path: string | null): string | null => {
    if (!path) return null;
    return path.startsWith('/') ? path : `/${path}`;
  };

  const canAccessPath = (path: string | null): boolean => {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) return true;
    const perm = permissionMap.get(normalizedPath);
    if (!perm) return true;
    return hasPermission(perm);
  };

  const canAccess = (item: RouteItem): boolean => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  };

  const buildTenantMenu = (items: MenuConfigItem[]): MenuItem[] => {
    const result: MenuItem[] = [];
    for (const item of items) {
      if (!item.visible) continue;
      if (item.routePath && !canAccessPath(item.routePath)) continue;

      if (item.children && item.children.length > 0) {
        const visibleChildren = item.children.filter(
          (child) => child.visible && canAccessPath(child.routePath),
        );
        if (visibleChildren.length === 0) continue;
        result.push({
          key: item.menuKey,
          icon: getIcon(item.icon),
          label: item.label,
          children: visibleChildren.map((child) => ({
            key: normalizePath(child.routePath) || child.menuKey,
            icon: getIcon(child.icon),
            label: child.label,
          })),
        });
      } else {
        result.push({
          key: normalizePath(item.routePath) || item.menuKey,
          icon: getIcon(item.icon),
          label: item.label,
        });
      }
    }
    return result;
  };

  const buildDefaultMenu = (entries: RouteEntry[]): MenuItem[] => {
    const items: MenuItem[] = [];
    for (const entry of entries) {
      if (isRouteGroup(entry)) {
        const visibleChildren = entry.children.filter(canAccess);
        if (visibleChildren.length === 0) continue;
        items.push({
          key: entry.key,
          icon: entry.icon,
          label: entry.label,
          children: visibleChildren.map((child) => ({
            key: child.path,
            icon: child.icon,
            label: child.label,
          })),
        });
      } else {
        if (!canAccess(entry)) continue;
        items.push({
          key: entry.path,
          icon: entry.icon,
          label: entry.label,
        });
      }
    }
    return items;
  };

  const menuItems: MenuItem[] = useMemo(() => {
    const items = menuConfig && menuConfig.length > 0
      ? buildTenantMenu(menuConfig)
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
  }, [workspace, menuConfig, routeEntries, canManageWorkspaceMenus, menuManageGroupIcon, menuManageGroupKey, menuManageGroupLabel, hasPermission]);

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
      if (routeWorkspace === workspace && menuConfig && menuConfig.length > 0) {
        return isConfiguredMenuPathAllowed(location.pathname, menuConfig, userPermissions);
      }
      return true;
    },
    [location.pathname, workspace, menuConfig, userPermissions, user, hasPermission],
  );

  const openKeys = useMemo(() => {
    if (location.pathname === '/menu-config' && canManageWorkspaceMenus) {
      return [menuManageGroupKey];
    }

    if (menuConfig && menuConfig.length > 0) {
      for (const item of menuConfig) {
        if (item.children?.some((child) => normalizePath(child.routePath) === location.pathname)) {
          return [item.menuKey];
        }
      }
      return [];
    }

    for (const entry of routeEntries) {
      if (isRouteGroup(entry) && entry.children.some((child) => child.path === location.pathname)) {
        return [entry.key];
      }
    }
    return [];
  }, [workspace, routeEntries, location.pathname, menuConfig, canManageWorkspaceMenus, menuManageGroupKey]);

  useEffect(() => {
    setMenuOpenKeys(openKeys);
  }, [openKeys]);

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

    if (menuConfig && menuConfig.length > 0) {
      for (const item of menuConfig) {
        if (normalizePath(item.routePath) === location.pathname) {
          items.push({ title: item.label });
          return items;
        }
        const child = item.children?.find((entry) => normalizePath(entry.routePath) === location.pathname);
        if (child) {
          items.push({ title: item.label, path: normalizePath(item.routePath) || undefined });
          items.push({ title: child.label });
          return items;
        }
      }
    }

    for (const entry of routeEntries) {
      if (isRouteGroup(entry)) {
        const child = entry.children.find((item) => item.path === location.pathname);
        if (child) {
          items.push({ title: entry.label });
          items.push({ title: child.label });
          return items;
        }
      } else if (entry.path === location.pathname) {
        items.push({ title: entry.label });
        return items;
      }
    }

    return items;
  }, [workspace, routeEntries, location.pathname, menuConfig, menuManageGroupLabel, user, hasPermission]);

  useEffect(() => {
    const byPath = resolveWorkspaceByPath(location.pathname);
    if (byPath && byPath !== enforcedWorkspace) {
      navigate(
        getWorkspaceHomePath(
          enforcedWorkspace,
          userPermissions,
          enforcedWorkspace === 'tenant' ? menuConfig : undefined,
        ),
        { replace: true },
      );
      return;
    }
    if (workspace !== enforcedWorkspace) {
      setWorkspace(enforcedWorkspace);
      persistWorkspace(enforcedWorkspace);
    }
  }, [location.pathname, workspace, enforcedWorkspace, navigate, userPermissions, menuConfig]);

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
