import { create } from 'zustand';
import request from '../utils/request';
import { markSessionActive } from '../utils/request';
import { getErrorMessage, isUnauthorizedError } from '../utils/errors';
import {
  clearRefreshToken,
  clearSessionExpired,
  markSessionExpired,
  clearTokens,
  clearUserCache,
  getAccessToken,
  getRefreshToken,
  readUserCache,
  setAccessToken,
  setRefreshToken,
  writeUserCache,
} from '../utils/authStorage';

interface UserInfo {
  id: number;
  username: string;
  realName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  userType: 'SYSTEM_OPS' | 'TENANT_USER';
  tenantSuperAdmin: boolean;
  tenantId: string;
  tenantName: string;
  roles: string[];
  permissions: string[];
  authorizedMenuPaths: string[];
}

type UserPayload = Partial<Omit<UserInfo, 'roles' | 'permissions' | 'authorizedMenuPaths'>> & {
  roles?: unknown[];
  permissions?: unknown[];
  authorizedMenuPaths?: unknown[];
};

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** Set when the user profile could not be refreshed (network/5xx), not for 401. */
  meError: string | null;
  login: (loginMethod: string, credentials: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setAuth: (token: string, refreshToken: string | null, user?: UserPayload | UserInfo | null) => void;
  clearAuth: () => void;
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (...perms: string[]) => boolean;
}

function normalizeUser(payload: UserPayload | UserInfo | null | undefined): UserInfo {
  const raw = payload ?? {};
  const roles = (Array.isArray(raw.roles) ? raw.roles : [])
    .map((role) => {
      if (typeof role === 'string') {
        return role;
      }
      if (role && typeof role === 'object' && 'roleCode' in role) {
        const roleCode = (role as { roleCode?: unknown }).roleCode;
        return typeof roleCode === 'string' ? roleCode : '';
      }
      return '';
    })
    .filter((item): item is string => item.length > 0);

  const permissions = (Array.isArray(raw.permissions) ? raw.permissions : [])
    .filter((perm): perm is string => typeof perm === 'string' && perm.length > 0);
  const authorizedMenuPaths = (Array.isArray(raw.authorizedMenuPaths) ? raw.authorizedMenuPaths : [])
    .filter((path): path is string => typeof path === 'string' && path.length > 0);

  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    username: typeof raw.username === 'string' ? raw.username : '',
    realName: typeof raw.realName === 'string' ? raw.realName : null,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    phone: typeof raw.phone === 'string' ? raw.phone : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    userType: raw.userType === 'SYSTEM_OPS' ? 'SYSTEM_OPS' : 'TENANT_USER',
    tenantSuperAdmin: raw.tenantSuperAdmin === true,
    tenantId: raw.tenantId != null ? String(raw.tenantId) : '',
    tenantName: typeof raw.tenantName === 'string' ? raw.tenantName : '',
    roles,
    permissions,
    authorizedMenuPaths,
  };
}

function loadCachedUser(): UserInfo | null {
  try {
    const raw = readUserCache();
    if (!raw) {
      return null;
    }
    return normalizeUser(JSON.parse(raw) as UserPayload);
  } catch {
    return null;
  }
}

const useAuthStore = create<AuthState>((set, get) => ({
  token: getAccessToken(),
  refreshToken: getRefreshToken(),
  user: loadCachedUser(),
  isAuthenticated: !!getAccessToken(),
  loading: false,
  meError: null,

  fetchMe: async () => {
    const { token } = get();
    if (!token) {
      return;
    }

    set({ loading: true, meError: null });
    let meRes;
    try {
      meRes = await request.get('/users/me');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        markSessionExpired();
        get().clearAuth();
        set({ loading: false });
        return;
      }
      // A transient backend/network failure must not log the user out; keep the cached
      // session and surface a retry affordance in the layout instead.
      set({
        loading: false,
        meError: getErrorMessage(error, '加载用户信息失败'),
      });
      return;
    }

    const cached = get().user ?? loadCachedUser();
    let permissions = cached?.permissions ?? [];
    let authorizedMenuPaths = cached?.authorizedMenuPaths ?? [];
    let permissionError: string | null = null;
    try {
      const permsRes = await request.get('/users/me/permissions');
      if (Array.isArray(permsRes.data?.data)) {
        permissions = permsRes.data.data.filter(
          (perm: unknown): perm is string => typeof perm === 'string' && perm.length > 0,
        );
      }
    } catch (error) {
      // Never overwrite known permissions with an empty list: that would turn a
      // temporary failure into "no menu, no access" for the rest of the session.
      permissionError = getErrorMessage(error, '加载权限信息失败，部分菜单可能不可见');
    }

    const mePayload = (meRes.data?.data ?? {}) as UserPayload;
    if (Array.isArray(mePayload.authorizedMenuPaths)) {
      // An explicit empty list means "no menus for this account"; only a missing field falls back to cache.
      authorizedMenuPaths = (mePayload.authorizedMenuPaths as string[])
        .filter((path): path is string => typeof path === 'string' && path.length > 0);
    }

    const normalizedUser = normalizeUser({
      ...mePayload,
      permissions,
      authorizedMenuPaths,
    });

    writeUserCache(JSON.stringify(normalizedUser));
    set({
      user: normalizedUser,
      isAuthenticated: true,
      loading: false,
      meError: permissionError,
    });
  },

  login: async (loginMethod, credentials) => {
    const res = await request.post('/auth/login', {
      loginMethod,
      platform: 'WEB',
      ...credentials,
    });
    const data = res.data?.data || {};
    const accessToken = data.accessToken as string;
    if (!accessToken) {
      throw new Error('登录响应异常：未返回访问令牌，请稍后重试或联系管理员');
    }
    const refreshToken = (data.refreshToken as string | undefined) || null;
    get().setAuth(accessToken, refreshToken, data.user as UserPayload | undefined);
  },

  logout: async () => {
    try {
      await request.post('/auth/logout');
    } catch {
      // Ignore: the local session must be cleared even when the server call fails.
    }
    get().clearAuth();
  },

  setAuth: (token, refreshToken, user) => {
    setAccessToken(token);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    } else {
      clearRefreshToken();
    }
    markSessionActive();
    clearSessionExpired();

    const normalizedUser = user ? normalizeUser(user) : null;
    if (normalizedUser) {
      writeUserCache(JSON.stringify(normalizedUser));
    } else {
      clearUserCache();
    }

    set({
      token,
      refreshToken,
      user: normalizedUser,
      isAuthenticated: true,
      meError: null,
    });
  },

  clearAuth: () => {
    clearTokens();
    clearUserCache();
    set({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      meError: null,
    });
  },

  hasPermission: (perm) => {
    const permissions = Array.isArray(get().user?.permissions) ? (get().user?.permissions as string[]) : [];
    if (permissions.includes('*') || permissions.includes(perm)) {
      return true;
    }
    const resource = perm.split(':')[0];
    return permissions.includes(`${resource}:*`);
  },

  hasAnyPermission: (...perms) => perms.some((perm) => get().hasPermission(perm)),
}));

export default useAuthStore;
