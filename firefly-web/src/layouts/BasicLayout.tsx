import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { Avatar, Breadcrumb, Dropdown, Form, Input, Layout, Menu, Modal, Spin, Space, Tag, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  BookOutlined,
  CloseOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import NotificationDropdown from '../components/NotificationDropdown';
import AlarmDropdown from '../components/AlarmDropdown';
import ExportCenterDropdown from '../components/ExportCenterDropdown';
import useAuthStore from '../store/useAuthStore';
import { userApi, workspaceMenuCustomizationApi } from '../services/api';
import { getIcon } from '../config/iconMap';
import { getRouteItemByPath, isRoutePathRegistered } from '../config/routes';
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
type ChangePasswordFormValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

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
const PAGE_TAB_EXCLUDED_PATHS = new Set(['/403']);

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

function findMenuNodeByPath(nodes: WorkspaceMenuNode[], pathname: string): WorkspaceMenuNode | null {
  for (const node of nodes) {
    if (node.routePath === pathname) {
      return node;
    }
    const children = node.children ?? [];
    if (children.length > 0) {
      const found = findMenuNodeByPath(children, pathname);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function arePathListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

const BasicLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
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
  const [openedTabs, setOpenedTabs] = useState<string[]>([]);
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>({});
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordForm] = Form.useForm<ChangePasswordFormValues>();

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
    // Root and nested wildcard redirects must be allowed to render first, otherwise the layout
    // will short-circuit "/" and unknown in-app paths to /403 before HomeRedirect can run.
    if (location.pathname === '/403' || location.pathname === '/' || !isRoutePathRegistered(location.pathname)) {
      return true;
    }
    return isWorkspacePathAllowed(location.pathname, permissions, authorizedMenuPaths);
  }, [authorizedMenuPaths, location.pathname, permissions]);

  const canViewAlarmDropdown = useMemo(() => (
    enforcedWorkspace === 'tenant' && isWorkspacePathAllowed('/alarm-records', permissions, authorizedMenuPaths)
  ), [authorizedMenuPaths, enforcedWorkspace, permissions]);

  const canViewOpenApiDocs = useMemo(() => (
    enforcedWorkspace === 'tenant' && isWorkspacePathAllowed('/app-key', permissions, authorizedMenuPaths)
  ), [authorizedMenuPaths, enforcedWorkspace, permissions]);

  const isPageTabRoute = useCallback((pathname: string) => (
    isRoutePathRegistered(pathname) && !PAGE_TAB_EXCLUDED_PATHS.has(pathname)
  ), []);

  const isTabPathAccessible = useCallback((pathname: string) => (
    isPageTabRoute(pathname) && isWorkspacePathAllowed(pathname, permissions, authorizedMenuPaths)
  ), [authorizedMenuPaths, isPageTabRoute, permissions]);

  const resolveTabMeta = useCallback((pathname: string) => {
    const menuNode = findMenuNodeByPath(menuTree, pathname);
    if (menuNode) {
      return {
        label: menuNode.label,
        icon: getIcon(menuNode.icon),
      };
    }

    const routeItem = getRouteItemByPath(pathname);
    return {
      label: routeItem?.label ?? pathname,
      icon: routeItem?.icon,
    };
  }, [menuTree]);

  const renderedKeepAlivePaths = useMemo(() => {
    const visiblePaths = openedTabs.filter((path) => cachedPages[path] || path === location.pathname);
    if (currentPathAccessible && isPageTabRoute(location.pathname) && !visiblePaths.includes(location.pathname)) {
      return [...visiblePaths, location.pathname];
    }
    return visiblePaths;
  }, [cachedPages, currentPathAccessible, isPageTabRoute, location.pathname, openedTabs]);

  const displayedTabs = useMemo(() => {
    if (!currentPathAccessible || !isPageTabRoute(location.pathname) || openedTabs.includes(location.pathname)) {
      return openedTabs;
    }
    return [...openedTabs, location.pathname];
  }, [currentPathAccessible, isPageTabRoute, location.pathname, openedTabs]);

  const activeTabKey = useMemo(() => (
    displayedTabs.includes(location.pathname) ? location.pathname : undefined
  ), [displayedTabs, location.pathname]);

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

  useEffect(() => {
    if (!outlet || !currentPathAccessible || !isPageTabRoute(location.pathname)) {
      return;
    }

    setOpenedTabs((previous) => (
      previous.includes(location.pathname) ? previous : [...previous, location.pathname]
    ));

    // Keep opened business pages mounted after the first visit so local form state survives route switches.
    setCachedPages((previous) => (
      previous[location.pathname] ? previous : { ...previous, [location.pathname]: outlet }
    ));
  }, [currentPathAccessible, isPageTabRoute, location.pathname, outlet]);

  useEffect(() => {
    setOpenedTabs((previous) => {
      const next = previous.filter((path) => isTabPathAccessible(path));
      return arePathListsEqual(previous, next) ? previous : next;
    });

    setCachedPages((previous) => {
      const entries = Object.entries(previous).filter(([path]) => isTabPathAccessible(path));
      if (entries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(entries);
    });
  }, [isTabPathAccessible]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const closeTab = useCallback((targetPath: string) => {
    if (targetPath === '/dashboard') {
      return;
    }

    const nextTabs = openedTabs.filter((path) => path !== targetPath);
    setOpenedTabs(nextTabs);
    setCachedPages((previous) => {
      if (!previous[targetPath]) {
        return previous;
      }
      const next = { ...previous };
      delete next[targetPath];
      return next;
    });

    if (location.pathname !== targetPath) {
      return;
    }

    if (nextTabs.length === 0) {
      navigate(getWorkspaceHomePath(workspace, permissions, authorizedMenuPaths));
      return;
    }

    const closingIndex = openedTabs.indexOf(targetPath);
    const fallbackIndex = Math.min(closingIndex, nextTabs.length - 1);
    navigate(nextTabs[Math.max(fallbackIndex, 0)]);
  }, [authorizedMenuPaths, location.pathname, navigate, openedTabs, permissions, workspace]);

  const handleLogout = async () => {
    await logout();
    setOpenedTabs([]);
    setCachedPages({});
    navigate('/login');
  };

  const closeChangePasswordModal = useCallback(() => {
    setChangePasswordOpen(false);
    changePasswordForm.resetFields();
  }, [changePasswordForm]);

  const handleChangePassword = useCallback(async (values: ChangePasswordFormValues) => {
    setChangePasswordSubmitting(true);
    try {
      await userApi.changePassword(values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      closeChangePasswordModal();
    } catch (error) {
      const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(errorMessage || '密码修改失败');
    } finally {
      setChangePasswordSubmitting(false);
    }
  }, [closeChangePasswordModal]);

  const handleUserMenuClick = useCallback(async ({ key }: { key: string }) => {
    if (key === 'change-password') {
      setChangePasswordOpen(true);
      return;
    }

    if (key === 'logout') {
      await handleLogout();
    }
  }, [handleLogout]);

  const dropdownItems: MenuProps = {
    onClick: ({ key }) => {
      void handleUserMenuClick({ key });
    },
    items: [
      {
        key: 'change-password',
        icon: <LockOutlined />,
        label: '修改密码',
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
      },
    ],
  };

  return (
    <Layout className="app-layout-root" style={{ minHeight: '100vh' }}>
      <Sider
        className="app-sider"
        width={248}
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="light"
        style={{
          background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fa 100%)',
          borderRight: '1px solid #dbe4ee',
        }}
      >
        <div
          style={{
            height: 64,
            padding: collapsed ? '0 12px' : '0 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #e6edf5',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe',
              boxShadow: '0 8px 18px rgba(37,99,235,0.12)',
              color: '#2563eb',
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
              <span style={{ color: '#0f172a', fontWeight: 700, fontSize: 16 }}>Firefly IoT</span>
              <span style={{ color: '#64748b', fontSize: 12 }}>
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
              theme="light"
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

      <Layout style={{ background: 'linear-gradient(180deg, #edf2f7 0%, #e7edf4 100%)' }}>
        <Header
          className="app-header"
          style={{
            height: 64,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            borderBottom: '1px solid #dbe4ee',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={16} className="layout-header-left">
            <div
              onClick={() => setCollapsed((value) => !value)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#475569',
                background: '#f8fbff',
                border: '1px solid #e2e8f0',
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>
            <Tag
              style={{
                margin: 0,
                borderRadius: 999,
                paddingInline: 12,
                borderColor: workspace === 'platform' ? '#bfdbfe' : '#bbf7d0',
                background: workspace === 'platform' ? '#eff6ff' : '#f0fdf4',
                color: workspace === 'platform' ? '#1d4ed8' : '#15803d',
              }}
            >
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

          <div className="layout-header-right">
            {canViewOpenApiDocs ? (
              <button
                type="button"
                className="layout-header-quick-action"
                onClick={() => navigate('/app-key?tab=docs')}
                aria-label="接口文档"
              >
                <span className="layout-header-quick-action__icon">
                  <BookOutlined />
                </span>
                <span className="layout-header-quick-action__label">接口文档</span>
              </button>
            ) : null}
            <NotificationDropdown />
            <AlarmDropdown visible={canViewAlarmDropdown} />
            <ExportCenterDropdown />
            <Dropdown menu={dropdownItems} placement="bottomRight">
              <div className="layout-user-inline">
                <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
                <span className="layout-user-inline__name">
                  {user?.realName || user?.username || '用户'}
                </span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 16, minHeight: 360 }}>
          {displayedTabs.length > 0 ? (
            <div className="page-tabs-shell">
              <div className="page-tabs" role="tablist" aria-label="已打开页面">
                {displayedTabs.map((path) => {
                  const meta = resolveTabMeta(path);
                  const closable = path !== '/dashboard';
                  const active = path === activeTabKey;
                  return (
                    <button
                      key={path}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? 'page-tab page-tab--active' : 'page-tab'}
                      onClick={() => navigate(path)}
                    >
                      <span className="page-tab-label">
                        {meta.icon ? <span className="page-tab-label__icon">{meta.icon}</span> : null}
                        <span className="page-tab-label__text">{meta.label}</span>
                      </span>
                      {closable ? (
                        <span
                          className="page-tab__close"
                          onClick={(event) => {
                            event.stopPropagation();
                            closeTab(path);
                          }}
                        >
                          <CloseOutlined />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="page-content-shell">
            <div className="keep-alive-pages">
              {renderedKeepAlivePaths.map((path) => {
                const pageContent = path === location.pathname ? (cachedPages[path] ?? outlet) : cachedPages[path];
                if (!pageContent) {
                  return null;
                }
                return (
                  <div
                    key={path}
                    className={path === location.pathname && currentPathAccessible && isPageTabRoute(location.pathname)
                      ? 'keep-alive-page keep-alive-page--active'
                      : 'keep-alive-page'}
                  >
                    {pageContent}
                  </div>
                );
              })}
            </div>

            {!currentPathAccessible ? <Navigate to="/403" replace /> : null}
            {currentPathAccessible && !isPageTabRoute(location.pathname) ? outlet : null}
          </div>
        </Content>
      </Layout>
      <Modal
        title="修改密码"
        open={changePasswordOpen}
        onCancel={closeChangePasswordModal}
        onOk={() => changePasswordForm.submit()}
        confirmLoading={changePasswordSubmitting}
        destroyOnHidden
        width={420}
      >
        <Form<ChangePasswordFormValues>
          form={changePasswordForm}
          layout="vertical"
          autoComplete="off"
          onFinish={(values) => void handleChangePassword(values)}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default BasicLayout;
