import { create } from 'zustand';
import request from '../utils/request';

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
  login: (loginMethod: string, credentials: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setAuth: (token: string, refreshToken: string | null, user?: UserPayload | UserInfo | null) => void;
  clearAuth: () => void;
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (...perms: string[]) => boolean;
}

const USER_CACHE_KEY = 'user_info';

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
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeUser(JSON.parse(raw) as UserPayload);
  } catch {
    return null;
  }
}

const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  user: loadCachedUser(),
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,

  fetchMe: async () => {
    const { token } = get();
    if (!token) {
      return;
    }

    set({ loading: true });
    try {
      const [meRes, permsRes] = await Promise.all([
        request.get('/users/me'),
        request.get('/users/me/permissions').catch(() => null),
      ]);
      const normalizedUser = normalizeUser({
        ...(meRes.data?.data || {}),
        permissions: Array.isArray(permsRes?.data?.data) ? permsRes?.data?.data : [],
      });

      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedUser));
      set({ user: normalizedUser, isAuthenticated: true, loading: false });
    } catch {
      get().clearAuth();
      set({ loading: false });
    }
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
      throw new Error('Invalid login response: accessToken is missing.');
    }
    const refreshToken = (data.refreshToken as string | undefined) || null;
    get().setAuth(accessToken, refreshToken, data.user as UserPayload | undefined);
  },

  logout: async () => {
    try {
      await request.post('/auth/logout');
    } catch {
      // ignore
    }
    get().clearAuth();
  },

  setAuth: (token, refreshToken, user) => {
    localStorage.setItem('access_token', token);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    } else {
      localStorage.removeItem('refresh_token');
    }

    const normalizedUser = user ? normalizeUser(user) : null;
    if (normalizedUser) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedUser));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }

    set({
      token,
      refreshToken,
      user: normalizedUser,
      isAuthenticated: true,
    });
  },

  clearAuth: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem(USER_CACHE_KEY);
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
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
