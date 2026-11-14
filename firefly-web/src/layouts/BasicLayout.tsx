import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Skeleton,
  Spin,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BookOutlined,
  CloseOutlined,
  DownOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
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
import { getErrorMessage } from '../utils/errors';
import { clearPathDirty, isPathDirty } from '../utils/dirtyRegistry';
import { PAGE_ACTIVATED_EVENT } from '../hooks/usePageActivation';
import { SESSION_EXPIRED_EVENT } from '../utils/request';

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
const SIDER_COLLAPSED_KEY = 'firefly:sider-collapsed';
const MENU_OPEN_KEYS_KEY = 'firefly:menu-open-keys';
const OPEN_TABS_KEY = 'firefly:open-tabs';
/** Upper bound for keep-alive pages so long sessions do not retain every visited page (and its Monaco/echarts instances). */
const MAX_KEEP_ALIVE_PAGES = 12;

function loadWorkspaceCache(): WorkspaceType {
  const cached = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return cached === 'platform' || cached === 'tenant' ? cached : 'tenant';
}

function persistWorkspace(workspace: WorkspaceType) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; state is still kept in memory for this session.
  }
}

function readSessionArray(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readCollapsed(): boolean {
  return readLocal(SIDER_COLLAPSED_KEY) === '1';
}

function readMenuOpenKeys(): string[] {
  try {
    const raw = readLocal(MENU_OPEN_KEYS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
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
  const { user, logout, clearAuth, fetchMe, meError } = useAuthStore();
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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(readMenuOpenKeys);
  const [menuTree, setMenuTree] = useState<WorkspaceMenuNode[]>([]);
  const [menuTreeLoading, setMenuTreeLoading] = useState(false);
  const [menuTreeError, setMenuTreeError] = useState<string | null>(null);
  const [menuReloadToken, setMenuReloadToken] = useState(0);
  const [openedTabs, setOpenedTabs] = useState<string[]>(() => readSessionArray(OPEN_TABS_KEY));
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>({});
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordForm] = Form.useForm<ChangePasswordFormValues>();
  const menuKeysInitializedRef = useRef(false);
  const previousPathRef = useRef(location.pathname);
  const activationDispatchedRef = useRef(false);

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

  // Persist the sider state and the groups the user expanded instead of resetting them on every
  // route change (which used to collapse whichever second group the user had just opened).
  useEffect(() => {
    writeLocal(SIDER_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    writeLocal(MENU_OPEN_KEYS_KEY, JSON.stringify(menuOpenKeys));
  }, [menuOpenKeys]);

  useEffect(() => {
    writeSession(OPEN_TABS_KEY, JSON.stringify(openedTabs));
  }, [openedTabs]);

  useEffect(() => {
    if (menuKeysInitializedRef.current || menuTree.length === 0) {
      return;
    }
    menuKeysInitializedRef.current = true;
    if (menuOpenKeys.length === 0 && openKeys.length > 0) {
      setMenuOpenKeys(openKeys);
    }
  }, [menuOpenKeys.length, menuTree.length, openKeys]);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) {
      return;
    }
    previousPathRef.current = location.pathname;
    if (openKeys.length === 0) {
      return;
    }
    setMenuOpenKeys((previous) => {
      const merged = Array.from(new Set([...previous, ...openKeys]));
      return arePathListsEqual(previous, merged) ? previous : merged;
    });
  }, [location.pathname, openKeys]);

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
      setMenuTreeError(null);
      try {
        const response = await workspaceMenuCustomizationApi.currentTree();
        if (!active) {
          return;
        }
        setMenuTree((response.data?.data ?? []) as WorkspaceMenuNode[]);
      } catch (error) {
        if (active) {
          setMenuTree([]);
          setMenuTreeError(getErrorMessage(error, '加载菜单失败'));
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
  }, [user?.id, workspace, menuReloadToken]);

  useEffect(() => {
    if (!outlet || !currentPathAccessible || !isPageTabRoute(location.pathname)) {
      return;
    }

    setOpenedTabs((previous) => (
      previous.includes(location.pathname) ? previous : [...previous, location.pathname]
    ));

    // Keep opened business pages mounted after the first visit so local form state survives route switches.
    setCachedPages((previous) => {
      if (previous[location.pathname]) {
        return previous;
      }
      const next: Record<string, React.ReactNode> = { ...previous, [location.pathname]: outlet };
      const paths = Object.keys(next);
      if (paths.length > MAX_KEEP_ALIVE_PAGES) {
        const evictable = paths.find((path) => path !== location.pathname);
        if (evictable) {
          delete next[evictable];
        }
      }
      return next;
    });
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

  // Let keep-alive pages refetch when the user switches back to their tab (data would otherwise be stale).
  useEffect(() => {
    if (!activationDispatchedRef.current) {
      activationDispatchedRef.current = true;
      return;
    }
    window.dispatchEvent(new CustomEvent(PAGE_ACTIVATED_EVENT, { detail: { path: location.pathname } }));
  }, [location.pathname]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setOpenedTabs([]);
      setCachedPages({});
      try {
        sessionStorage.removeItem(OPEN_TABS_KEY);
      } catch {
        // ignore
      }
      // Navigate first so the private route does not bounce to /login and drop the reason.
      navigate('/login?expired=1', { replace: true });
      clearAuth();
      message.warning('登录状态已过期，请重新登录');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [clearAuth, navigate]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const closeTabNow = useCallback((targetPath: string) => {
    setOpenedTabs((previous) => previous.filter((path) => path !== targetPath));
    setCachedPages((previous) => {
      if (!previous[targetPath]) {
        return previous;
      }
      const next = { ...previous };
      delete next[targetPath];
      return next;
    });
    clearPathDirty(targetPath);

    if (location.pathname !== targetPath) {
      return;
    }

    const remainingTabs = openedTabs.filter((path) => path !== targetPath);
    if (remainingTabs.length === 0) {
      navigate(getWorkspaceHomePath(workspace, permissions, authorizedMenuPaths));
      return;
    }

    const closingIndex = openedTabs.indexOf(targetPath);
    const fallbackIndex = Math.min(closingIndex, remainingTabs.length - 1);
    navigate(remainingTabs[Math.max(fallbackIndex, 0)]);
  }, [authorizedMenuPaths, location.pathname, navigate, openedTabs, permissions, workspace]);

  const requestCloseTab = useCallback((targetPath: string) => {
    if (!isPathDirty(targetPath)) {
      closeTabNow(targetPath);
      return;
    }
    Modal.confirm({
      title: '关闭页签',
      content: '该页签还有未保存的修改，关闭后本次填写的内容将丢失。',
      okText: '关闭页签',
      cancelText: '返回页面',
      okButtonProps: { danger: true },
      onOk: () => closeTabNow(targetPath),
    });
  }, [closeTabNow]);

  const closeOtherTabs = useCallback(() => {
    const keepPath = location.pathname;
    const closingPaths = openedTabs.filter((path) => path !== keepPath);
    if (closingPaths.length === 0) {
      return;
    }
    const dirtyCount = closingPaths.filter((path) => isPathDirty(path)).length;
    const apply = () => {
      setOpenedTabs((previous) => previous.filter((path) => path === keepPath));
      setCachedPages((previous) => (previous[keepPath] ? { [keepPath]: previous[keepPath] } : {}));
      closingPaths.forEach((path) => clearPathDirty(path));
    };
    if (dirtyCount === 0) {
      apply();
      return;
    }
    Modal.confirm({
      title: '关闭其他页签',
      content: `其中 ${dirtyCount} 个页签有未保存的修改，关闭后内容将丢失。`,
      okText: '关闭其他页签',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: apply,
    });
  }, [location.pathname, openedTabs]);

  const closeAllTabs = useCallback(() => {
    const dirtyCount = openedTabs.filter((path) => isPathDirty(path)).length;
    const apply = () => {
      setOpenedTabs([]);
      setCachedPages({});
      openedTabs.forEach((path) => clearPathDirty(path));
      navigate(getWorkspaceHomePath(workspace, permissions, authorizedMenuPaths));
    };
    if (dirtyCount === 0) {
      apply();
      return;
    }
    Modal.confirm({
      title: '关闭全部页签',
      content: `其中 ${dirtyCount} 个页签有未保存的修改，关闭后内容将丢失。`,
      okText: '关闭全部页签',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: apply,
    });
  }, [authorizedMenuPaths, navigate, openedTabs, permissions, workspace]);

  const handleLogout = async () => {
    await logout();
    setOpenedTabs([]);
    setCachedPages({});
    try {
      sessionStorage.removeItem(OPEN_TABS_KEY);
    } catch {
      // ignore
    }
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
      message.error(getErrorMessage(error, '密码修改失败'));
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
          ) : menuTreeError ? (
            <Alert
              type="error"
              showIcon
              message="菜单加载失败"
              description={menuTreeError}
              action={(
                <Button size="small" icon={<ReloadOutlined />} onClick={() => setMenuReloadToken((token) => token + 1)}>
                  重试
                </Button>
              )}
            />
          ) : menuItems.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前账号暂无可访问菜单"
              style={{ marginTop: 32 }}
            />
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
            <Tooltip title={collapsed ? '展开菜单' : '收起菜单'}>
              <button
                type="button"
                className="layout-sider-toggle"
                aria-label={collapsed ? '展开菜单' : '收起菜单'}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </button>
            </Tooltip>
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
                    <button
                      type="button"
                      className="breadcrumb-link"
                      onClick={() => navigate(item.path!)}
                    >
                      {item.title}
                    </button>
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
              <button type="button" className="layout-user-inline" aria-label="账户菜单" aria-haspopup="menu">
                <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
                <span className="layout-user-inline__name">
                  {user?.realName || user?.username || '用户'}
                </span>
              </button>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 16, minHeight: 360 }}>
          {meError ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="账号信息未完整加载"
              description={`${meError}。当前展示的是上次登录缓存的权限，可能出现菜单缺失或权限校验失败；请重试或重新登录。`}
              action={(
                <Button size="small" onClick={() => void fetchMe()}>
                  重试
                </Button>
              )}
            />
          ) : null}
          {displayedTabs.length > 0 ? (
            <div className="page-tabs-shell">
              <div className="page-tabs" role="tablist" aria-label="已打开页面">
                {displayedTabs.map((path) => {
                  const meta = resolveTabMeta(path);
                  const closable = displayedTabs.length > 1;
                  const active = path === activeTabKey;
                  return (
                    <div key={path} className={active ? 'page-tab page-tab--active' : 'page-tab'}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="page-tab__main"
                        onClick={() => navigate(path)}
                      >
                        <span className="page-tab-label">
                          {meta.icon ? <span className="page-tab-label__icon">{meta.icon}</span> : null}
                          <span className="page-tab-label__text">{meta.label}</span>
                        </span>
                      </button>
                      {closable ? (
                        <button
                          type="button"
                          className="page-tab__close"
                          aria-label={`关闭 ${meta.label}`}
                          onClick={() => requestCloseTab(path)}
                        >
                          <CloseOutlined />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {displayedTabs.length > 1 ? (
                <Dropdown
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'others', label: '关闭其他页签', onClick: closeOtherTabs },
                      { key: 'all', label: '关闭全部页签', onClick: closeAllTabs },
                    ],
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<DownOutlined />}
                    aria-label="页签操作"
                    className="page-tabs-actions"
                  />
                </Dropdown>
              ) : null}
            </div>
          ) : null}

          <div className="page-content-shell">
            <Suspense
              fallback={(
                <div style={{ padding: 8 }}>
                  <Skeleton active paragraph={{ rows: 8 }} />
                </div>
              )}
            >
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
            </Suspense>
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
        width={440}
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
            extra="6-64 位；建议使用 8 位以上，并同时包含大小写字母、数字和符号。"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码至少 6 位' },
              { max: 64, message: '新密码最多 64 位' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue('oldPassword') !== value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('新密码不能与当前密码相同'));
                },
              }),
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
