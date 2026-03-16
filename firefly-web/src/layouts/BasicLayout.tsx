import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Breadcrumb, Dropdown, Layout, Menu, Space, Spin, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import NotificationDropdown from '../components/NotificationDropdown';
import ExportCenterDropdown from '../components/ExportCenterDropdown';
import useAuthStore from '../store/useAuthStore';
import { workspaceMenuCustomizationApi } from '../services/api';
import { getIcon } from '../config/iconMap';
import {
  getWorkspaceHomePath,
  isWorkspacePathAllowed,
  resolveWorkspaceByPath,
  resolveWorkspaceByUserType,
  type WorkspaceType,
  WORKSPACE_STORAGE_KEY,
} from '../config/workspaceRoutes';

type MenuItem = Required<MenuProps>['items'][number];
type BreadcrumbItem = { title: string; path?: string };

interface WorkspaceMenuNode {
  menuKey: string;
  label: string;
  icon?: string | null;
  routePath?: string | null;
  visible?: boolean;
  children?: WorkspaceMenuNode[];
}

const { Header, Sider, Content } = Layout;
const MENU_TREE_REFRESH_EVENT = 'firefly:menu-tree-refresh';

function loadWorkspaceCache(): WorkspaceType {
  const cached = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return cached === 'platform' || cached === 'tenant' ? cached : 'tenant';
}

function persistWorkspace(workspace: WorkspaceType) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
}

function buildMenuItems(nodes: WorkspaceMenuNode[]): MenuItem[] {
  return nodes.flatMap((node) => {
    if (node.visible === false) {
      return [];
    }
    const children = buildMenuItems(node.children ?? []);
    if (children.length > 0) {
      return [{
        key: node.menuKey,
        icon: getIcon(node.icon),
        label: node.label,
        children,
      }];
    }
    if (!node.routePath) {
      return [];
    }
    return [{
      key: node.routePath,
      icon: getIcon(node.icon),
      label: node.label,
    }];
  });
}

function findMenuTrail(nodes: WorkspaceMenuNode[], pathname: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.routePath === pathname) {
      return trail;
    }
    const children = node.children ?? [];
    if (children.length > 0) {
      const found = findMenuTrail(children, pathname, [...trail, node.menuKey]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findBreadcrumbTrail(
  nodes: WorkspaceMenuNode[],
  pathname: string,
  trail: BreadcrumbItem[] = [],
): BreadcrumbItem[] | null {
  for (const node of nodes) {
    if (node.routePath === pathname) {
      return [...trail, { title: node.label, path: node.routePath }];
    }
    const children = node.children ?? [];
    if (children.length > 0) {
      const found = findBreadcrumbTrail(children, pathname, [...trail, { title: node.label }]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

const BasicLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const authorizedMenuPaths = useMemo(
    () => (Array.isArray(user?.authorizedMenuPaths) ? user.authorizedMenuPaths : []),
    [user?.authorizedMenuPaths],
  );
  const permissions = useMemo(
    () => (Array.isArray(user?.permissions) ? user.permissions : []),
    [user?.permissions],
  );
  const enforcedWorkspace = useMemo(
    () => resolveWorkspaceByUserType(user?.userType),
    [user?.userType],
  );

  const [workspace, setWorkspace] = useState<WorkspaceType>(loadWorkspaceCache);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>([]);
  const [menuTree, setMenuTree] = useState<WorkspaceMenuNode[]>([]);
  const [menuTreeLoading, setMenuTreeLoading] = useState(false);

  const menuItems = useMemo(() => buildMenuItems(menuTree), [menuTree]);
  const openKeys = useMemo(
    () => findMenuTrail(menuTree, location.pathname) ?? [],
    [location.pathname, menuTree],
  );
  const breadcrumbItems = useMemo(
    () => findBreadcrumbTrail(menuTree, location.pathname) ?? [],
    [location.pathname, menuTree],
  );

  const currentPathAccessible = useMemo(() => {
    if (location.pathname === '/403') {
      return true;
    }
    return isWorkspacePathAllowed(location.pathname, permissions, authorizedMenuPaths);
  }, [authorizedMenuPaths, location.pathname, permissions]);

  useEffect(() => {
    setMenuOpenKeys(openKeys);
  }, [openKeys]);

  useEffect(() => {
    const routeWorkspace = resolveWorkspaceByPath(location.pathname);
    if (routeWorkspace && routeWorkspace !== enforcedWorkspace) {
      navigate(getWorkspaceHomePath(enforcedWorkspace, permissions, authorizedMenuPaths), { replace: true });
      return;
    }

    if (workspace !== enforcedWorkspace) {
      setWorkspace(enforcedWorkspace);
      persistWorkspace(enforcedWorkspace);
    }
  }, [authorizedMenuPaths, enforcedWorkspace, location.pathname, navigate, permissions, workspace]);

  useEffect(() => {
    let active = true;

    const loadMenuTree = async () => {
      setMenuTreeLoading(true);
      try {
        const response = await workspaceMenuCustomizationApi.currentTree();
        if (!active) {
          return;
        }
        setMenuTree((response.data?.data ?? []) as WorkspaceMenuNode[]);
      } catch {
        if (active) {
          setMenuTree([]);
        }
      } finally {
        if (active) {
          setMenuTreeLoading(false);
        }
      }
    };

    void loadMenuTree();

    const handleRefresh = () => {
      void loadMenuTree();
    };
    window.addEventListener(MENU_TREE_REFRESH_EVENT, handleRefresh);
    return () => {
      active = false;
      window.removeEventListener(MENU_TREE_REFRESH_EVENT, handleRefresh);
    };
  }, [user?.id, workspace]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const dropdownItems: MenuProps = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout,
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={248}
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #16213a 45%, #1e293b 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            height: 64,
            padding: collapsed ? '0 12px' : '0 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            F
          </div>
          {!collapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 16 }}>Firefly IoT</span>
              <span style={{ color: 'rgba(248,250,252,0.62)', fontSize: 12 }}>
                {workspace === 'platform' ? '系统运维空间' : '租户业务空间'}
              </span>
            </div>
          ) : null}
        </div>

        <div style={{ height: 'calc(100vh - 64px)', overflow: 'auto', padding: 8 }}>
          {menuTreeLoading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="small" />
            </div>
          ) : (
            <Menu
              mode="inline"
              theme="dark"
              items={menuItems}
              selectedKeys={[location.pathname]}
              openKeys={collapsed ? [] : menuOpenKeys}
              onOpenChange={(keys) => setMenuOpenKeys(keys as string[])}
              onClick={handleMenuClick}
              style={{
                background: 'transparent',
                border: 'none',
              }}
            />
          )}
        </div>
      </Sider>

      <Layout style={{ background: '#eef2f7' }}>
        <Header
          style={{
            height: 64,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(15,23,42,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={16}>
            <div
              onClick={() => setCollapsed((value) => !value)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#475569',
                background: '#f8fafc',
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>
            <Tag color={workspace === 'platform' ? 'geekblue' : 'green'}>
              {workspace === 'platform' ? '系统运维空间' : '租户业务空间'}
            </Tag>
            <Breadcrumb
              items={breadcrumbItems.map((item, index) => {
                const isLast = index === breadcrumbItems.length - 1;
                return {
                  title: item.path && !isLast ? (
                    <span onClick={() => navigate(item.path!)} style={{ cursor: 'pointer', color: '#64748b' }}>
                      {item.title}
                    </span>
                  ) : (
                    <span style={{ color: isLast ? '#0f172a' : '#64748b' }}>{item.title}</span>
                  ),
                };
              })}
            />
          </Space>

          <Space size={8}>
            <NotificationDropdown />
            <ExportCenterDropdown />
            <Dropdown menu={dropdownItems} placement="bottomRight">
              <Space
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
                <span style={{ color: '#0f172a', fontWeight: 500 }}>
                  {user?.realName || user?.username || '用户'}
                </span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: 20,
            padding: 24,
            minHeight: 360,
            borderRadius: 20,
            background: '#ffffff',
            boxShadow: '0 12px 36px rgba(15,23,42,0.06)',
          }}
        >
          {currentPathAccessible ? <Outlet /> : <Navigate to="/403" replace />}
        </Content>
      </Layout>
    </Layout>
  );
};

export default BasicLayout;
