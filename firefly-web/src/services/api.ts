import request, { deviceRequest, ruleRequest, dataRequest, supportRequest, mediaRequest, connectorRequest } from '../utils/request';
// authRequest removed: auth merged into system; notification/template moved to support

type TenantPlan = 'FREE' | 'STANDARD' | 'ENTERPRISE';
type TenantStatus = 'PENDING' | 'INITIALIZING' | 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE' | 'DEACTIVATING' | 'DELETED';
type IsolationLevel = 'SHARED_RLS' | 'SCHEMA' | 'DATABASE';

interface TenantListParams {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  plan?: TenantPlan;
  status?: TenantStatus;
}

interface TenantAdminUserPayload {
  username: string;
  password: string;
  phone?: string;
  email?: string;
  realName?: string;
}

interface TenantCreatePayload {
  code: string;
  name: string;
  displayName?: string;
  description?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  plan?: TenantPlan;
  isolationLevel?: IsolationLevel;
  adminUser: TenantAdminUserPayload;
}

interface TenantUpdatePayload {
  name?: string;
  displayName?: string;
  description?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  logoUrl?: string;
}

interface TenantQuotaPayload {
  maxDevices?: number;
  maxMsgPerSec?: number;
  maxRules?: number;
  dataRetentionDays?: number;
  maxOtaStorageGb?: number;
  maxApiCallsDay?: number;
  maxUsers?: number;
  maxProjects?: number;
  maxVideoChannels?: number;
  maxVideoStorageGb?: number;
  maxSharePolicies?: number;
}

interface TenantSpaceMenuPayload {
  menuKeys: string[];
}

interface TenantOpenApiSubscriptionItemPayload {
  openApiCode: string;
  ipWhitelist?: string[];
  concurrencyLimit?: number;
  dailyLimit?: number;
}

interface TenantOpenApiSubscriptionSavePayload {
  items: TenantOpenApiSubscriptionItemPayload[];
}

const TENANT_PLAN_VALUES = new Set<TenantPlan>(['FREE', 'STANDARD', 'ENTERPRISE']);
const TENANT_STATUS_VALUES = new Set<TenantStatus>([
  'PENDING',
  'INITIALIZING',
  'ACTIVE',
  'SUSPENDED',
  'MAINTENANCE',
  'DEACTIVATING',
  'DELETED',
]);
const TENANT_ISOLATION_VALUES = new Set<IsolationLevel>(['SHARED_RLS', 'SCHEMA', 'DATABASE']);
const TENANT_UPDATE_KEYS = new Set<keyof TenantUpdatePayload>([
  'name',
  'displayName',
  'description',
  'contactName',
  'contactPhone',
  'contactEmail',
  'logoUrl',
]);
const TENANT_QUOTA_FIELDS = [
  'maxDevices',
  'maxMsgPerSec',
  'maxRules',
  'dataRetentionDays',
  'maxOtaStorageGb',
  'maxApiCallsDay',
  'maxUsers',
  'maxProjects',
  'maxVideoChannels',
  'maxVideoStorageGb',
  'maxSharePolicies',
] as const;

type TenantQuotaField = (typeof TENANT_QUOTA_FIELDS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trimOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeTenantId = (id: number): number => {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('invalid tenant id');
  }
  return id;
};

const normalizeOptionalEmail = (value: unknown, fieldName: string): string | undefined => {
  const trimmed = trimOptionalString(value);
  if (!trimmed) return undefined;
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new Error(`invalid ${fieldName}`);
  }
  return trimmed;
};

const normalizeOptionalDate = (value?: string): string | undefined => {
  const trimmed = trimOptionalString(value);
  if (!trimmed) return undefined;
  if (!DATE_PATTERN.test(trimmed)) {
    throw new Error('invalid date format, expected YYYY-MM-DD');
  }
  return trimmed;
};

const normalizeOptionalBoundedString = (
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | undefined => {
  const trimmed = trimOptionalString(value);
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }
  return trimmed;
};

const normalizeTenantSpaceMenuPayload = (payload: TenantSpaceMenuPayload): TenantSpaceMenuPayload => {
  if (!payload || !Array.isArray(payload.menuKeys)) {
    throw new Error('tenant space menu payload is invalid');
  }

  const menuKeys = payload.menuKeys
    .map((menuKey, index) => {
      const normalized = trimOptionalString(menuKey);
      if (!normalized) {
        throw new Error(`tenant space menu key[${index}] is required`);
      }
      return normalized;
    })
    .filter((menuKey, index, array) => array.indexOf(menuKey) === index);

  if (menuKeys.length === 0) {
    throw new Error('tenant space menu keys are empty');
  }

  return { menuKeys };
};

const normalizeLimitValue = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(normalized) || normalized === 0 || normalized < -1) {
    throw new Error(`invalid ${fieldName}`);
  }
  return normalized;
};

const normalizeTenantOpenApiSubscriptionPayload = (
  payload: TenantOpenApiSubscriptionSavePayload,
): TenantOpenApiSubscriptionSavePayload => {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('tenant open api subscription payload is invalid');
  }

  const codes = new Set<string>();
  const items = payload.items.map((item, index) => {
    const openApiCode = trimOptionalString(item?.openApiCode);
    if (!openApiCode) {
      throw new Error(`tenant open api item[${index}] code is required`);
    }
    if (codes.has(openApiCode)) {
      throw new Error(`duplicate tenant open api code: ${openApiCode}`);
    }
    codes.add(openApiCode);

    const ipWhitelist = Array.isArray(item?.ipWhitelist)
      ? item.ipWhitelist
          .map((ip, ipIndex) => {
            const normalizedIp = trimOptionalString(ip);
            if (!normalizedIp) {
              throw new Error(`tenant open api item[${index}] ipWhitelist[${ipIndex}] is invalid`);
            }
            return normalizedIp;
          })
          .filter((ip, ipIndex, list) => list.indexOf(ip) === ipIndex)
      : [];

    return {
      openApiCode,
      ipWhitelist,
      concurrencyLimit: normalizeLimitValue(item?.concurrencyLimit, `concurrencyLimit for ${openApiCode}`),
      dailyLimit: normalizeLimitValue(item?.dailyLimit, `dailyLimit for ${openApiCode}`),
    };
  });

  return { items };
};

const normalizeTenantListParams = (params: TenantListParams = {}): TenantListParams => {
  const pageNum = Number.isFinite(params.pageNum) ? Number(params.pageNum) : 1;
  const pageSize = Number.isFinite(params.pageSize) ? Number(params.pageSize) : 20;
  const normalized: TenantListParams = {
    pageNum: Math.max(1, pageNum),
    pageSize: Math.min(200, Math.max(1, pageSize)),
    keyword: trimOptionalString(params.keyword),
  };
  if (params.plan) {
    if (!TENANT_PLAN_VALUES.has(params.plan)) {
      throw new Error('invalid tenant plan');
    }
    normalized.plan = params.plan;
  }
  if (params.status) {
    if (!TENANT_STATUS_VALUES.has(params.status)) {
      throw new Error('invalid tenant status');
    }
    normalized.status = params.status;
  }
  return normalized;
};

const normalizeTenantCreatePayload = (payload: TenantCreatePayload): TenantCreatePayload => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('tenant payload is required');
  }
  const code = trimOptionalString(payload.code);
  const name = trimOptionalString(payload.name);
  const adminUsername = trimOptionalString(payload.adminUser?.username);
  const adminPassword = trimOptionalString(payload.adminUser?.password);
  const isolationLevel = payload.isolationLevel;
  const contactEmail = normalizeOptionalEmail(payload.contactEmail, 'contact email');
  const adminEmail = normalizeOptionalEmail(payload.adminUser?.email, 'admin email');

  if (!code || !/^[A-Za-z0-9_-]{2,63}$/.test(code)) {
    throw new Error('invalid tenant code');
  }
  if (!name) {
    throw new Error('tenant name is required');
  }
  if (name.length > 256) {
    throw new Error('tenant name is too long');
  }
  if (!adminUsername) {
    throw new Error('tenant admin username is required');
  }
  if (!adminPassword) {
    throw new Error('tenant admin password is required');
  }
  if (payload.plan && !TENANT_PLAN_VALUES.has(payload.plan)) {
    throw new Error('invalid tenant plan');
  }
  if (isolationLevel && !TENANT_ISOLATION_VALUES.has(isolationLevel)) {
    throw new Error('invalid tenant isolation level');
  }

  return {
    ...payload,
    code,
    name,
    displayName: normalizeOptionalBoundedString(payload.displayName, 'display name', 256),
    description: trimOptionalString(payload.description),
    contactName: trimOptionalString(payload.contactName),
    contactPhone: trimOptionalString(payload.contactPhone),
    contactEmail,
    isolationLevel,
    adminUser: {
      ...payload.adminUser,
      username: adminUsername,
      password: adminPassword,
      phone: trimOptionalString(payload.adminUser.phone),
      email: adminEmail,
      realName: trimOptionalString(payload.adminUser.realName),
    },
  };
};

const normalizeTenantUpdatePayload = (payload: Record<string, unknown>): TenantUpdatePayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('tenant update payload is required');
  }

  const unsupportedKey = Object.keys(payload).find(
    (key) => !TENANT_UPDATE_KEYS.has(key as keyof TenantUpdatePayload),
  );
  if (unsupportedKey) {
    throw new Error(`unsupported tenant update field: ${unsupportedKey}`);
  }

  const normalized: TenantUpdatePayload = {};
  const source = payload as TenantUpdatePayload;

  if ('name' in payload) {
    const name = normalizeOptionalBoundedString(source.name, 'tenant name', 256);
    if (!name) {
      throw new Error('tenant name is required');
    }
    normalized.name = name;
  }
  if ('displayName' in payload) {
    normalized.displayName = normalizeOptionalBoundedString(source.displayName, 'display name', 256);
  }
  if ('description' in payload) {
    normalized.description = trimOptionalString(source.description);
  }
  if ('contactName' in payload) {
    normalized.contactName = trimOptionalString(source.contactName);
  }
  if ('contactPhone' in payload) {
    normalized.contactPhone = trimOptionalString(source.contactPhone);
  }
  if ('contactEmail' in payload) {
    normalized.contactEmail = normalizeOptionalEmail(source.contactEmail, 'contact email');
  }
  if ('logoUrl' in payload) {
    normalized.logoUrl = trimOptionalString(source.logoUrl);
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error('tenant update payload is empty');
  }

  return normalized;
};

const normalizeTenantQuotaPayload = (payload: Record<string, unknown>): TenantQuotaPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('tenant quota payload is required');
  }

  const unsupportedKey = Object.keys(payload).find(
    (key) => !TENANT_QUOTA_FIELDS.includes(key as TenantQuotaField),
  );
  if (unsupportedKey) {
    throw new Error(`unsupported tenant quota field: ${unsupportedKey}`);
  }

  const normalized: TenantQuotaPayload = {};
  TENANT_QUOTA_FIELDS.forEach((field) => {
    const rawValue = payload[field];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return;
    }
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isInteger(numericValue) || numericValue < -1) {
      throw new Error(`invalid ${field}`);
    }
    normalized[field] = numericValue;
  });

  if (Object.keys(normalized).length === 0) {
    throw new Error('tenant quota payload is empty');
  }

  return normalized;
};

// ==================== Tenant API ====================
export const tenantApi = {
  list: (data: TenantListParams = {}) => request.post('/platform/tenants/list', normalizeTenantListParams(data)),
  get: (id: number) => request.get(`/platform/tenants/${normalizeTenantId(id)}`),
  create: (data: TenantCreatePayload) => request.post('/platform/tenants', normalizeTenantCreatePayload(data)),
  update: (id: number, data: Record<string, unknown>) =>
    request.put(`/platform/tenants/${normalizeTenantId(id)}`, normalizeTenantUpdatePayload(data)),
  updateStatus: (id: number, status: TenantStatus, reason?: string) => {
    if (!TENANT_STATUS_VALUES.has(status)) {
      throw new Error('invalid tenant status');
    }
    return request.put(`/platform/tenants/${normalizeTenantId(id)}/status`, null, {
      params: { status, reason: trimOptionalString(reason) },
    });
  },
  updatePlan: (id: number, plan: TenantPlan) => {
    if (!TENANT_PLAN_VALUES.has(plan)) {
      throw new Error('invalid tenant plan');
    }
    return request.put(`/platform/tenants/${normalizeTenantId(id)}/plan`, { plan });
  },
  getQuota: (id: number) => request.get(`/platform/tenants/${normalizeTenantId(id)}/quota`),
  updateQuota: (id: number, data: Record<string, unknown>) =>
    request.put(`/platform/tenants/${normalizeTenantId(id)}/quota`, normalizeTenantQuotaPayload(data)),
  getOpenApiSubscriptions: (id: number) => request.get(`/platform/tenants/${normalizeTenantId(id)}/open-api-subscriptions`),
  updateOpenApiSubscriptions: (id: number, payload: TenantOpenApiSubscriptionSavePayload) =>
    request.put(
      `/platform/tenants/${normalizeTenantId(id)}/open-api-subscriptions`,
      normalizeTenantOpenApiSubscriptionPayload(payload),
    ),
  getSpaceMenus: (id: number) => request.get(`/platform/tenants/${normalizeTenantId(id)}/space-menus`),
  updateSpaceMenus: (id: number, payload: TenantSpaceMenuPayload) =>
    request.put(`/platform/tenants/${normalizeTenantId(id)}/space-menus`, normalizeTenantSpaceMenuPayload(payload)),
  getUsage: (id: number) => request.get(`/platform/tenants/${normalizeTenantId(id)}/usage`),
  getUsageDaily: (id: number, startDate?: string, endDate?: string) =>
    request.get(`/platform/tenants/${normalizeTenantId(id)}/usage/daily`, {
      params: { startDate: normalizeOptionalDate(startDate), endDate: normalizeOptionalDate(endDate) },
    }),
  deactivate: (id: number) => request.post(`/platform/tenants/${normalizeTenantId(id)}/deactivate`),
  resetAdminPassword: (id: number, newPassword: string) =>
    request.post(`/platform/tenants/${normalizeTenantId(id)}/admin-password/reset`, { newPassword }),
  overview: () => request.get('/platform/tenants/overview'),
};

// ==================== Tenant Self-Management API ====================
export const tenantSelfApi = {
  get: () => request.get('/tenant'),
  update: (data: Record<string, unknown>) => request.put('/tenant', normalizeTenantUpdatePayload(data)),
  getQuotaUsage: () => request.get('/tenant/quota'),
  getUsage: () => request.get('/tenant/usage'),
  getUsageDaily: (startDate?: string, endDate?: string) =>
    request.get('/tenant/usage/daily', {
      params: { startDate: normalizeOptionalDate(startDate), endDate: normalizeOptionalDate(endDate) },
    }),
};

// ==================== User API ====================
export const userApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/users/list', data),
  options: () => request.get('/users/options'),
  get: (id: number) => request.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => request.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => request.put(`/users/${id}`, data),
  updateStatus: (id: number, status: string) =>
    request.put(`/users/${id}/status`, null, { params: { status } }),
  delete: (id: number) => request.delete(`/users/${id}`),
  assignRoles: (id: number, roles: Array<{ roleId: number; projectId?: number }>) =>
    request.put(`/users/${id}/roles`, roles),
  resetPassword: (id: number, newPassword: string) =>
    request.post(`/users/${id}/reset-password`, newPassword),
  getUserRoles: (id: number) => request.get(`/users/${id}/roles`),
  getMyPermissions: () => request.get('/users/me/permissions'),
  getMe: () => request.get('/users/me'),
  updateMe: (data: Record<string, unknown>) => request.put('/users/me', data),
  changePassword: (oldPassword: string, newPassword: string) =>
    request.put('/users/me/password', { oldPassword, newPassword }),
};

// ==================== Role API ====================
export const roleApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/roles/list', data),
  options: () => request.get('/roles/options'),
  permissionGroups: () => request.get('/roles/permission-groups'),
  get: (id: number) => request.get(`/roles/${id}`),
  create: (data: Record<string, unknown>) => request.post('/roles', data),
  update: (id: number, data: Record<string, unknown>) => request.put(`/roles/${id}`, data),
  delete: (id: number) => request.delete(`/roles/${id}`),
  listUsers: (id: number) => request.get(`/roles/${id}/users`),
};

// ==================== Permission API ====================
export const permissionApi = {
  listAll: () => request.get('/permissions'),
  listGroups: () => request.get('/permissions/groups'),
};

// ==================== File API ====================
export const fileApi = {
  upload: (file: File, dir?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (dir) formData.append('dir', dir);
    return supportRequest.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadFirmware: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return supportRequest.post('/files/upload/firmware', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getPresignedUrl: (objectName: string) => supportRequest.get('/files/presigned', { params: { objectName } }),
  delete: (objectName: string) => supportRequest.delete('/files', { params: { objectName } }),
};

// ==================== Video API ====================
export const videoApi = {
  list: (data: Record<string, unknown> = {}) => mediaRequest.post('/video/devices/list', data),
  get: (id: number) => mediaRequest.get(`/video/devices/${id}`),
  create: (data: Record<string, unknown>) => mediaRequest.post('/video/devices', data),
  update: (id: number, data: Record<string, unknown>) => mediaRequest.put(`/video/devices/${id}`, data),
  delete: (id: number) => mediaRequest.delete(`/video/devices/${id}`),
  channels: (id: number) => mediaRequest.get(`/video/devices/${id}/channels`),
  startStream: (id: number, data?: Record<string, unknown>) => mediaRequest.post(`/video/devices/${id}/start`, data || {}),
  stopStream: (id: number) => mediaRequest.post(`/video/devices/${id}/stop`),
  ptz: (id: number, data: Record<string, unknown>) => mediaRequest.post(`/video/devices/${id}/ptz`, data),
  snapshot: (id: number) => mediaRequest.post(`/video/devices/${id}/snapshot`),
  queryCatalog: (id: number) => mediaRequest.post(`/video/devices/${id}/catalog`),
  queryDeviceInfo: (id: number) => mediaRequest.post(`/video/devices/${id}/device-info`),
  startRecording: (id: number) => mediaRequest.post(`/video/devices/${id}/record/start`),
  stopRecording: (id: number) => mediaRequest.post(`/video/devices/${id}/record/stop`),
};

// ==================== System Settings API ====================
export const systemConfigApi = {
  list: () => request.get('/settings/configs'),
  listByGroup: (group: string) => request.get(`/settings/configs/group/${group}`),
  batchUpdate: (data: Record<string, unknown>[]) => request.put('/settings/configs', data),
  update: (data: Record<string, unknown>) => request.put('/settings/configs/single', data),
};

// ==================== Operation Log API ====================
export const operationLogApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/operation-logs/list', data),
  get: (id: number) => request.get(`/operation-logs/${id}`),
  clean: (days?: number) => request.post('/operation-logs/clean', null, { params: { days } }),
};

// ==================== Dict API ====================
export const dictApi = {
  listTypes: (data: Record<string, unknown> = {}) => request.post('/dicts/types/list', data),
  getType: (id: number) => request.get(`/dicts/types/${id}`),
  getTypeByCode: (code: string) => request.get(`/dicts/types/by-code?code=${code}`),
  createType: (data: Record<string, unknown>) => request.post('/dicts/types', data),
  updateType: (id: number, data: Record<string, unknown>) => request.put(`/dicts/types/${id}`, data),
  deleteType: (id: number) => request.delete(`/dicts/types/${id}`),
  listItems: (dictTypeId: number) => request.get(`/dicts/types/${dictTypeId}/items`),
  listItemsByCode: (dictCode: string) => request.get(`/dicts/items/by-code?dictCode=${dictCode}`),
  createItem: (dictTypeId: number, data: Record<string, unknown>) => request.post(`/dicts/types/${dictTypeId}/items`, data),
  updateItem: (itemId: number, data: Record<string, unknown>) => request.put(`/dicts/items/${itemId}`, data),
  deleteItem: (itemId: number) => request.delete(`/dicts/items/${itemId}`),
};

// ==================== Permission Resource API ====================
export const permissionResourceApi = {
  list: () => request.get('/permission-resources'),
  get: (id: number) => request.get(`/permission-resources/${id}`),
  tree: () => request.get('/permission-resources/tree'),
  listByType: (type: string) => request.get(`/permission-resources/by-type?type=${type}`),
  create: (data: Record<string, unknown>) => request.post('/permission-resources', data),
  update: (id: number, data: Record<string, unknown>) => request.put(`/permission-resources/${id}`, data),
  delete: (id: number) => request.delete(`/permission-resources/${id}`),
  getRolePermissions: (roleId: number) => request.get(`/permission-resources/role/${roleId}`),
  assignRolePermissions: (roleId: number, permissions: string[]) => request.put(`/permission-resources/role/${roleId}`, { permissions }),
};

export const systemMenuPermissionApi = {
  tree: (workspaceScope: 'PLATFORM' | 'TENANT') =>
    request.get('/system-menu-permissions/tree', { params: { workspaceScope } }),
  createMenu: (data: Record<string, unknown>) => request.post('/system-menu-permissions/menus', data),
  updateMenu: (workspaceScope: 'PLATFORM' | 'TENANT', menuKey: string, data: Record<string, unknown>) =>
    request.put(`/system-menu-permissions/menus/${menuKey}`, data, { params: { workspaceScope } }),
  deleteMenu: (workspaceScope: 'PLATFORM' | 'TENANT', menuKey: string) =>
    request.delete(`/system-menu-permissions/menus/${menuKey}`, { params: { workspaceScope } }),
  replacePermissions: (menuKey: string, data: { workspaceScope: 'PLATFORM' | 'TENANT'; permissionCodes: string[] }) =>
    request.put(`/system-menu-permissions/menus/${menuKey}/permissions`, data),
};

export const workspaceMenuCustomizationApi = {
  currentTree: () => request.get('/workspace-menu-customizations/current/tree'),
  currentManageTree: () => request.get('/workspace-menu-customizations/current/manage/tree'),
  updateCurrentMenu: (
    menuKey: string,
    data: { label: string; parentMenuKey?: string; sortOrder?: number },
  ) => request.put(`/workspace-menu-customizations/current/menus/${menuKey}`, data),
  resetCurrentMenu: (menuKey: string) => request.delete(`/workspace-menu-customizations/current/menus/${menuKey}`),
};

// ==================== System Monitor API ====================
export const monitorApi = {
  getAll: () => dataRequest.get('/monitor'),
  getJvm: () => dataRequest.get('/monitor/jvm'),
  getMemory: () => dataRequest.get('/monitor/memory'),
  getCpu: () => dataRequest.get('/monitor/cpu'),
  getDisk: () => dataRequest.get('/monitor/disk'),
  getThread: () => dataRequest.get('/monitor/thread'),
  getGc: () => dataRequest.get('/monitor/gc'),
  getServer: () => dataRequest.get('/monitor/server'),
};

// ==================== Message Template API ====================
export const messageTemplateApi = {
  list: (data: Record<string, unknown> = {}) => supportRequest.post('/message-templates/list', data),
  get: (id: number) => supportRequest.get(`/message-templates/${id}`),
  getByCode: (code: string) => supportRequest.get(`/message-templates/by-code?code=${code}`),
  listByChannel: (channel: string) => supportRequest.get(`/message-templates/by-channel?channel=${channel}`),
  create: (data: Record<string, unknown>) => supportRequest.post('/message-templates', data),
  update: (id: number, data: Record<string, unknown>) => supportRequest.put(`/message-templates/${id}`, data),
  delete: (id: number) => supportRequest.delete(`/message-templates/${id}`),
  toggle: (id: number, enabled: boolean) => supportRequest.put(`/message-templates/${id}/toggle?enabled=${enabled}`),
  render: (data: Record<string, unknown>) => supportRequest.post('/message-templates/render', data),
  preview: (data: Record<string, unknown>) => supportRequest.post('/message-templates/preview', data),
};

// ==================== Device Log API ====================
export const deviceLogApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/device-logs/list', data),
  record: (data: Record<string, unknown>) => deviceRequest.post('/device-logs', data),
  recent: (deviceId: number, limit?: number) => deviceRequest.get(`/device-logs/${deviceId}/recent`, { params: { limit } }),
  count: (deviceId: number) => deviceRequest.get(`/device-logs/${deviceId}/count`),
  clean: (days?: number) => deviceRequest.post('/device-logs/clean', null, { params: { days } }),
};

// ==================== Async Task API ====================
export const asyncTaskApi = {
  create: (data: Record<string, unknown>) => supportRequest.post('/async-tasks', data),
  list: (data: Record<string, unknown> = {}) => supportRequest.post('/async-tasks/list', data),
  mine: (data: Record<string, unknown> = {}) => supportRequest.post('/async-tasks/mine/list', data),
  get: (id: number) => supportRequest.get(`/async-tasks/${id}`),
  download: (id: number) => `/SUPPORT/api/v1/async-tasks/${id}/download`,
  cancel: (id: number) => supportRequest.put(`/async-tasks/${id}/cancel`),
  delete: (id: number) => supportRequest.delete(`/async-tasks/${id}`),
  clean: () => supportRequest.post('/async-tasks/clean'),
};

// ==================== Scheduled Task API ====================
export const scheduledTaskApi = {
  create: (data: Record<string, unknown>) => supportRequest.post('/scheduled-tasks', data),
  update: (id: number, data: Record<string, unknown>) => supportRequest.put(`/scheduled-tasks/${id}`, data),
  delete: (id: number) => supportRequest.delete(`/scheduled-tasks/${id}`),
  get: (id: number) => supportRequest.get(`/scheduled-tasks/${id}`),
  list: (data: Record<string, unknown> = {}) => supportRequest.post('/scheduled-tasks/list', data),
  enable: (id: number) => supportRequest.put(`/scheduled-tasks/${id}/enable`),
  disable: (id: number) => supportRequest.put(`/scheduled-tasks/${id}/disable`),
  executeOnce: (id: number) => supportRequest.post(`/scheduled-tasks/${id}/execute`),
  listLogs: (data: Record<string, unknown> = {}) => supportRequest.post('/scheduled-tasks/logs/list', data),
  cleanLogs: (days?: number) => supportRequest.post('/scheduled-tasks/logs/clean', null, { params: { days } }),
};

// ==================== SNMP API ====================
export const snmpApi = {
  test: (data: Record<string, unknown>) => connectorRequest.post('/snmp/test', data),
  systemInfo: (data: Record<string, unknown>) => connectorRequest.post('/snmp/system-info', data),
  get: (data: Record<string, unknown>) => connectorRequest.post('/snmp/get', data),
  walk: (data: Record<string, unknown>) => connectorRequest.post('/snmp/walk', data),
  registerCollector: (data: Record<string, unknown>) => connectorRequest.post('/snmp/collectors', data),
  unregisterCollector: (taskId: string) => connectorRequest.delete(`/snmp/collectors/${taskId}`),
  listCollectors: () => connectorRequest.get('/snmp/collectors'),
  collectorStatus: (taskId: string) => connectorRequest.get(`/snmp/collectors/${taskId}/status`),
};

// ==================== Modbus API ====================
export const modbusApi = {
  test: (data: Record<string, unknown>) => connectorRequest.post('/modbus/test', data),
  readHoldingRegisters: (data: Record<string, unknown>) => connectorRequest.post('/modbus/read-holding-registers', data),
  readInputRegisters: (data: Record<string, unknown>) => connectorRequest.post('/modbus/read-input-registers', data),
  readCoils: (data: Record<string, unknown>) => connectorRequest.post('/modbus/read-coils', data),
  readDiscreteInputs: (data: Record<string, unknown>) => connectorRequest.post('/modbus/read-discrete-inputs', data),
  writeSingleRegister: (data: Record<string, unknown>) => connectorRequest.post('/modbus/write-single-register', data),
  writeSingleCoil: (data: Record<string, unknown>) => connectorRequest.post('/modbus/write-single-coil', data),
  writeMultipleRegisters: (data: Record<string, unknown>) => connectorRequest.post('/modbus/write-multiple-registers', data),
  writeMultipleCoils: (data: Record<string, unknown>) => connectorRequest.post('/modbus/write-multiple-coils', data),
  registerCollector: (data: Record<string, unknown>) => connectorRequest.post('/modbus/collectors', data),
  unregisterCollector: (taskId: string) => connectorRequest.delete(`/modbus/collectors/${taskId}`),
  listCollectors: () => connectorRequest.get('/modbus/collectors'),
  collectorStatus: (taskId: string) => connectorRequest.get(`/modbus/collectors/${taskId}/status`),
};

interface DeviceLocatorPayload {
  locatorType: string;
  locatorValue: string;
  primaryLocator?: boolean;
}

interface DeviceDynamicRegisterPayload {
  productKey: string;
  productSecret: string;
  deviceName: string;
  nickname?: string;
  description?: string;
  tags?: string;
  locators?: DeviceLocatorPayload[];
}

export const deviceAccessApi = {
  dynamicRegister: (data: DeviceDynamicRegisterPayload) => connectorRequest.post('/protocol/device/register', data),
};

// ==================== WebSocket API ====================
export const websocketApi = {
  listSessions: () => connectorRequest.get('/websocket/sessions'),
  sessionCount: () => connectorRequest.get('/websocket/sessions/count'),
  getSession: (sessionId: string) => connectorRequest.get(`/websocket/sessions/${sessionId}`),
  disconnect: (sessionId: string) => connectorRequest.delete(`/websocket/sessions/${sessionId}`),
  send: (data: Record<string, unknown>) => connectorRequest.post('/websocket/send', data),
  broadcast: (data: Record<string, unknown>) => connectorRequest.post('/websocket/broadcast', data),
};

// ==================== TCP/UDP API ====================
export const tcpUdpApi = {
  // TCP
  listTcpSessions: () => connectorRequest.get('/tcp-udp/tcp/sessions'),
  tcpSessionCount: () => connectorRequest.get('/tcp-udp/tcp/sessions/count'),
  getTcpSession: (sessionId: string) => connectorRequest.get(`/tcp-udp/tcp/sessions/${sessionId}`),
  disconnectTcp: (sessionId: string) => connectorRequest.delete(`/tcp-udp/tcp/sessions/${sessionId}`),
  bindTcpSession: (sessionId: string, data: Record<string, unknown>) => connectorRequest.put(`/tcp-udp/tcp/sessions/${sessionId}/binding`, data),
  unbindTcpSession: (sessionId: string) => connectorRequest.delete(`/tcp-udp/tcp/sessions/${sessionId}/binding`),
  sendTcp: (data: Record<string, unknown>) => connectorRequest.post('/tcp-udp/tcp/send', data),
  broadcastTcp: (data: Record<string, unknown>) => connectorRequest.post('/tcp-udp/tcp/broadcast', data),
  // UDP
  listUdpPeers: () => connectorRequest.get('/tcp-udp/udp/peers'),
  udpPeerCount: () => connectorRequest.get('/tcp-udp/udp/peers/count'),
  udpStats: () => connectorRequest.get('/tcp-udp/udp/stats'),
  sendUdp: (data: Record<string, unknown>) => connectorRequest.post('/tcp-udp/udp/send', data),
  bindUdpPeer: (data: Record<string, unknown>) => connectorRequest.put('/tcp-udp/udp/peers/binding', data),
  unbindUdpPeer: (address: string, port: number) => connectorRequest.delete('/tcp-udp/udp/peers/binding', { params: { address, port } }),
  // Combined
  combinedStats: () => connectorRequest.get('/tcp-udp/stats'),
};

// ==================== LoRaWAN API ====================
export const loraWanApi = {
  listDevices: () => connectorRequest.get('/lorawan/devices'),
  deviceCount: () => connectorRequest.get('/lorawan/devices/count'),
  getDevice: (devEui: string) => connectorRequest.get(`/lorawan/devices/${devEui}`),
  sendDownlink: (data: Record<string, unknown>) => connectorRequest.post('/lorawan/downlink', data),
  stats: () => connectorRequest.get('/lorawan/stats'),
  config: () => connectorRequest.get('/lorawan/config'),
};

// ==================== Device Firmware API ====================
export const deviceFirmwareApi = {
  get: (deviceId: number) => deviceRequest.get(`/device-firmwares/${deviceId}`),
  listByFirmware: (firmwareId: number, data: Record<string, unknown> = {}) => deviceRequest.post(`/device-firmwares/by-firmware/${firmwareId}/list`, data),
  listByVersion: (version: string) => deviceRequest.get(`/device-firmwares/by-version?version=${version}`),
  bind: (data: Record<string, unknown>) => deviceRequest.post('/device-firmwares/bind', data),
  batchBind: (data: Record<string, unknown>) => deviceRequest.post('/device-firmwares/batch-bind', data),
  updateStatus: (deviceId: number, data: Record<string, unknown>) => deviceRequest.put(`/device-firmwares/${deviceId}/status`, data),
};

// ==================== GeoFence & Location API ====================
export const geoApi = {
  listFences: (data: Record<string, unknown> = {}) => deviceRequest.post('/geo/fences/list', data),
  getFence: (id: number) => deviceRequest.get(`/geo/fences/${id}`),
  createFence: (data: Record<string, unknown>) => deviceRequest.post('/geo/fences', data),
  updateFence: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/geo/fences/${id}`, data),
  deleteFence: (id: number) => deviceRequest.delete(`/geo/fences/${id}`),
  toggleFence: (id: number, enabled: boolean) => deviceRequest.put(`/geo/fences/${id}/toggle?enabled=${enabled}`),
  checkPosition: (id: number, lng: number, lat: number) => deviceRequest.post(`/geo/fences/${id}/check?lng=${lng}&lat=${lat}`),
  reportLocation: (data: Record<string, unknown>) => deviceRequest.post('/geo/locations/report', data),
  getLatestLocation: (deviceId: number) => deviceRequest.get(`/geo/locations/${deviceId}/latest`),
  getLocationHistory: (deviceId: number, data: Record<string, unknown> = {}) => deviceRequest.post(`/geo/locations/${deviceId}/history/list`, data),
  getTrack: (deviceId: number, params?: Record<string, unknown>) => deviceRequest.get(`/geo/locations/${deviceId}/track`, { params }),
};

// ==================== Device Tag API ====================
export const deviceTagApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/device-tags/list', data),
  listAll: () => deviceRequest.get('/device-tags/all'),
  create: (data: Record<string, unknown>) => deviceRequest.post('/device-tags', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/device-tags/${id}`, data),
  delete: (id: number) => deviceRequest.delete(`/device-tags/${id}`),
  listDevices: (id: number) => deviceRequest.get(`/device-tags/${id}/devices`),
  getDeviceTags: (deviceId: number) => deviceRequest.get(`/device-tags/by-device/${deviceId}`),
  bindTag: (id: number, deviceId: number) => deviceRequest.post(`/device-tags/${id}/devices?deviceId=${deviceId}`),
  unbindTag: (id: number, deviceId: number) => deviceRequest.delete(`/device-tags/${id}/devices/${deviceId}`),
  batchBind: (id: number, deviceIds: number[]) => deviceRequest.post(`/device-tags/${id}/devices/batch`, deviceIds),
  batchUnbind: (id: number, deviceIds: number[]) => deviceRequest.delete(`/device-tags/${id}/devices/batch`, { data: deviceIds }),
};

// ==================== Device Group API ====================
export const deviceGroupApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/device-groups/list', data),
  listAll: () => deviceRequest.get('/device-groups/all'),
  tree: () => deviceRequest.get('/device-groups/tree'),
  get: (id: number) => deviceRequest.get(`/device-groups/${id}`),
  create: (data: Record<string, unknown>) => deviceRequest.post('/device-groups', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/device-groups/${id}`, data),
  delete: (id: number) => deviceRequest.delete(`/device-groups/${id}`),
  listDevices: (id: number) => deviceRequest.get(`/device-groups/${id}/devices`),
  addDevice: (id: number, deviceId: number) => deviceRequest.post(`/device-groups/${id}/devices?deviceId=${deviceId}`),
  removeDevice: (id: number, deviceId: number) => deviceRequest.delete(`/device-groups/${id}/devices/${deviceId}`),
  batchAddDevices: (id: number, deviceIds: number[]) => deviceRequest.post(`/device-groups/${id}/devices/batch`, deviceIds),
  batchRemoveDevices: (id: number, deviceIds: number[]) => deviceRequest.delete(`/device-groups/${id}/devices/batch`, { data: deviceIds }),
};

// ==================== Dashboard API ====================
export const dashboardApi = {
  overview: () => dataRequest.get('/dashboard/overview'),
  deviceOnlineTrend: (interval?: string) => dataRequest.get('/dashboard/device-online-trend', { params: { interval } }),
  alarmDistribution: () => dataRequest.get('/dashboard/alarm-distribution'),
  recentAlarms: (limit?: number) => dataRequest.get('/dashboard/recent-alarms', { params: { limit } }),
  deviceByProduct: () => dataRequest.get('/dashboard/device-by-product'),
};

// ==================== Data Analysis API ====================
export const dataAnalysisApi = {
  queryTimeSeries: (data: Record<string, unknown>) => dataRequest.post('/analysis/timeseries', data),
  queryAggregation: (data: Record<string, unknown>) => dataRequest.post('/analysis/aggregation', data),
  listProperties: (data: Record<string, unknown>) => dataRequest.post('/analysis/properties/options', data),
  getDeviceStats: (params: Record<string, unknown>) => dataRequest.get('/analysis/stats', { params }),
  exportData: (data: Record<string, unknown>) => dataRequest.post('/analysis/export', data),
};

// ==================== Share Policy API ====================
export const sharePolicyApi = {
  listOwned: () => ruleRequest.get('/share-policies/owned'),
  listConsumed: () => ruleRequest.get('/share-policies/consumed'),
  get: (id: number) => ruleRequest.get(`/share-policies/${id}`),
  create: (data: Record<string, unknown>) => ruleRequest.post('/share-policies', data),
  update: (id: number, data: Record<string, unknown>) => ruleRequest.put(`/share-policies/${id}`, data),
  delete: (id: number) => ruleRequest.delete(`/share-policies/${id}`),
  approve: (id: number) => ruleRequest.post(`/share-policies/${id}/approve`),
  reject: (id: number) => ruleRequest.post(`/share-policies/${id}/reject`),
  revoke: (id: number) => ruleRequest.post(`/share-policies/${id}/revoke`),
  auditLogs: (data: Record<string, unknown> = {}) => ruleRequest.post('/share-policies/audit-logs/list', data),
};

// ==================== Notification API ====================
export const notificationChannelApi = {
  list: () => supportRequest.get('/notifications/channels'),
  listAvailableTypes: () => supportRequest.get('/notifications/channel-types/available'),
  get: (id: number) => supportRequest.get(`/notifications/channels/${id}`),
  create: (data: Record<string, unknown>) => supportRequest.post('/notifications/channels', data),
  update: (id: number, data: Record<string, unknown>) => supportRequest.put(`/notifications/channels/${id}`, data),
  delete: (id: number) => supportRequest.delete(`/notifications/channels/${id}`),
  toggle: (id: number, enabled: boolean) => supportRequest.put(`/notifications/channels/${id}/toggle?enabled=${enabled}`),
  test: (id: number) => supportRequest.post(`/notifications/channels/${id}/test`),
};

export const tenantWebhookApi = {
  list: (tenantId: number) => supportRequest.get(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels`),
  create: (tenantId: number, data: Record<string, unknown>) =>
    supportRequest.post(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels`, data),
  update: (tenantId: number, id: number, data: Record<string, unknown>) =>
    supportRequest.put(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels/${id}`, data),
  delete: (tenantId: number, id: number) =>
    supportRequest.delete(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels/${id}`),
  toggle: (tenantId: number, id: number, enabled: boolean) =>
    supportRequest.put(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels/${id}/toggle?enabled=${enabled}`),
  test: (tenantId: number, id: number) =>
    supportRequest.post(`/platform/tenants/${normalizeTenantId(tenantId)}/webhook-channels/${id}/test`),
};

export const notificationRecordApi = {
  list: (data: Record<string, unknown> = {}) => supportRequest.post('/notifications/records/list', data),
  get: (id: number) => supportRequest.get(`/notifications/records/${id}`),
};

// ==================== Audit Log API ====================
export const auditLogApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/audit-logs/list', data),
  get: (id: number) => request.get(`/audit-logs/${id}`),
};

// ==================== Device Data API ====================
export const deviceDataApi = {
  writeTelemetry: (deviceId: number, data: Record<string, unknown>) => deviceRequest.post(`/devices/${deviceId}/telemetry`, data),
  writeEvent: (deviceId: number, data: Record<string, unknown>) => deviceRequest.post(`/devices/${deviceId}/events`, data),
  query: (data: Record<string, unknown>) => deviceRequest.post('/device-data/query', data),
  aggregate: (data: Record<string, unknown>) => deviceRequest.post('/device-data/aggregate', data),
  latest: (deviceId: number) => deviceRequest.get(`/device-data/latest/${deviceId}`),
  listEvents: (data: Record<string, unknown> = {}) => deviceRequest.post('/device-events/list', data),
};

// ==================== OTA API ====================
export const firmwareApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/firmwares/list', data),
  get: (id: number) => deviceRequest.get(`/firmwares/${id}`),
  create: (data: Record<string, unknown>) => deviceRequest.post('/firmwares', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/firmwares/${id}`, data),
  verify: (id: number) => deviceRequest.put(`/firmwares/${id}/verify`),
  release: (id: number) => deviceRequest.put(`/firmwares/${id}/release`),
  delete: (id: number) => deviceRequest.delete(`/firmwares/${id}`),
};

export const otaTaskApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/ota-tasks/list', data),
  get: (id: number) => deviceRequest.get(`/ota-tasks/${id}`),
  create: (data: Record<string, unknown>) => deviceRequest.post('/ota-tasks', data),
  cancel: (id: number) => deviceRequest.put(`/ota-tasks/${id}/cancel`),
};

// ==================== Alarm API ====================
export const alarmRuleApi = {
  list: (data: Record<string, unknown> = {}) => ruleRequest.post('/alarm-rules/list', data),
  get: (id: number) => ruleRequest.get(`/alarm-rules/${id}`),
  create: (data: Record<string, unknown>) => ruleRequest.post('/alarm-rules', data),
  update: (id: number, data: Record<string, unknown>) => ruleRequest.put(`/alarm-rules/${id}`, data),
  delete: (id: number) => ruleRequest.delete(`/alarm-rules/${id}`),
};

export const alarmRecordApi = {
  list: (data: Record<string, unknown> = {}) => ruleRequest.post('/alarm-records/list', data),
  get: (id: number) => ruleRequest.get(`/alarm-records/${id}`),
  confirm: (id: number) => ruleRequest.put(`/alarm-records/${id}/confirm`),
  process: (id: number, data?: Record<string, unknown>) => ruleRequest.put(`/alarm-records/${id}/process`, data),
  close: (id: number) => ruleRequest.put(`/alarm-records/${id}/close`),
};

export const alarmRecipientGroupApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/alarm-recipient-groups/list', data),
  listOptions: () => request.get('/alarm-recipient-groups/options'),
  get: (code: string) => request.get(`/alarm-recipient-groups/${code}`),
  create: (data: Record<string, unknown>) => request.post('/alarm-recipient-groups', data),
  update: (code: string, data: Record<string, unknown>) => request.put(`/alarm-recipient-groups/${code}`, data),
  delete: (code: string) => request.delete(`/alarm-recipient-groups/${code}`),
};

// ==================== Rule Engine API ====================
export const ruleApi = {
  list: (data: Record<string, unknown> = {}) => ruleRequest.post('/rules/list', data),
  get: (id: number) => ruleRequest.get(`/rules/${id}`),
  create: (data: Record<string, unknown>) => ruleRequest.post('/rules', data),
  update: (id: number, data: Record<string, unknown>) => ruleRequest.put(`/rules/${id}`, data),
  enable: (id: number) => ruleRequest.put(`/rules/${id}/enable`),
  disable: (id: number) => ruleRequest.put(`/rules/${id}/disable`),
  delete: (id: number) => ruleRequest.delete(`/rules/${id}`),
};

// ==================== Device API ====================
export const deviceApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/devices/list', data),
  get: (id: number) => deviceRequest.get(`/devices/${id}`),
  create: (data: Record<string, unknown>) => deviceRequest.post('/devices', data),
  batchCreate: (data: Record<string, unknown>) => deviceRequest.post('/devices/batch', data),
  importDevices: (data: { productId: number; fileKey: string; fileFormat: string; projectId?: number; description?: string; tagIds?: number[]; groupIds?: number[] }) =>
    deviceRequest.post('/devices/import', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/devices/${id}`, data),
  enable: (id: number) => deviceRequest.put(`/devices/${id}/enable`),
  disable: (id: number) => deviceRequest.put(`/devices/${id}/disable`),
  delete: (id: number) => deviceRequest.delete(`/devices/${id}`),
  getSecret: (id: number) => deviceRequest.get(`/devices/${id}/secret`),
  exportTriples: (data: Record<string, unknown> = {}) => deviceRequest.post('/devices/triples/export', data),
  // Shadow
  getShadow: (id: number) => deviceRequest.get(`/devices/${id}/shadow`),
  updateDesired: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/devices/${id}/shadow/desired`, data),
  getDelta: (id: number) => deviceRequest.get(`/devices/${id}/shadow/delta`),
  deleteShadow: (id: number) => deviceRequest.delete(`/devices/${id}/shadow`),
  clearDesired: (id: number) => deviceRequest.delete(`/devices/${id}/shadow/desired`),
  listLocators: (deviceId: number) => deviceRequest.get(`/devices/${deviceId}/locators`),
  createLocator: (deviceId: number, data: Record<string, unknown>) =>
    deviceRequest.post(`/devices/${deviceId}/locators`, data),
  updateLocator: (deviceId: number, locatorId: number, data: Record<string, unknown>) =>
    deviceRequest.put(`/devices/${deviceId}/locators/${locatorId}`, data),
  deleteLocator: (deviceId: number, locatorId: number) =>
    deviceRequest.delete(`/devices/${deviceId}/locators/${locatorId}`),
};

// ==================== Product API ====================
export const productApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/products/list', data),
  get: (id: number) => deviceRequest.get(`/products/${id}`),
  getSecret: (id: number) => deviceRequest.get(`/products/${id}/secret`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return deviceRequest.post('/products/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  create: (data: Record<string, unknown>) => deviceRequest.post('/products', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/products/${id}`, data),
  publish: (id: number) => deviceRequest.put(`/products/${id}/publish`),
  delete: (id: number) => deviceRequest.delete(`/products/${id}`),
  getThingModel: (id: number) => deviceRequest.get(`/products/${id}/thing-model`),
  updateThingModel: (id: number, data: string) =>
    deviceRequest.put(`/products/${id}/thing-model`, data, {
      headers: { 'Content-Type': 'text/plain' },
    }),
  importThingModel: (id: number, data: { fileKey: string; fileFormat: string; importType?: string }) =>
    deviceRequest.post(`/products/${id}/thing-model/import`, data),
};

// ==================== Protocol Parser API ====================
export const protocolParserApi = {
  list: (data: Record<string, unknown> = {}) => deviceRequest.post('/protocol-parsers/list', data),
  get: (id: number) => deviceRequest.get(`/protocol-parsers/${id}`),
  versions: (id: number) => deviceRequest.get(`/protocol-parsers/${id}/versions`),
  create: (data: Record<string, unknown>) => deviceRequest.post('/protocol-parsers', data),
  update: (id: number, data: Record<string, unknown>) => deviceRequest.put(`/protocol-parsers/${id}`, data),
  test: (id: number, data: Record<string, unknown> = {}) => deviceRequest.post(`/protocol-parsers/${id}/test`, data),
  encodeTest: (id: number, data: Record<string, unknown> = {}) =>
    deviceRequest.post(`/protocol-parsers/${id}/encode-test`, data),
  publish: (id: number, changeLog?: string) =>
    deviceRequest.post(`/protocol-parsers/${id}/publish`, changeLog ? { changeLog } : {}),
  rollback: (id: number, version: number) => deviceRequest.post(`/protocol-parsers/${id}/rollback/${version}`),
  enable: (id: number) => deviceRequest.put(`/protocol-parsers/${id}/enable`),
  disable: (id: number) => deviceRequest.put(`/protocol-parsers/${id}/disable`),
  runtimePlugins: () => deviceRequest.get('/protocol-parsers/runtime/plugins'),
  reloadRuntimePlugins: () => deviceRequest.post('/protocol-parsers/runtime/plugins/reload'),
  pluginCatalog: () => deviceRequest.get('/protocol-parsers/runtime/plugins/catalog'),
  runtimeMetrics: () => deviceRequest.get('/protocol-parsers/runtime/metrics'),
};

// ==================== Project API ====================
export const projectApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/projects/list', data),
  get: (id: number) => request.get(`/projects/${id}`),
  create: (data: Record<string, unknown>) => request.post('/projects', data),
  update: (id: number, data: Record<string, unknown>) => request.put(`/projects/${id}`, data),
  updateStatus: (id: number, status: string) => request.put(`/projects/${id}/status?status=${status}`),
  // Members
  listMembers: (id: number) => request.get(`/projects/${id}/members`),
  addMember: (id: number, userId: number, role?: string) => request.post(`/projects/${id}/members?userId=${userId}&role=${role || 'MEMBER'}`),
  removeMember: (id: number, userId: number) => request.delete(`/projects/${id}/members/${userId}`),
  updateMemberRole: (id: number, userId: number, role: string) => request.put(`/projects/${id}/members/${userId}/role?role=${role}`),
  // Devices
  listDevices: (id: number) => request.get(`/projects/${id}/devices`),
  bindDevice: (id: number, deviceId: number) => request.post(`/projects/${id}/devices?deviceId=${deviceId}`),
  unbindDevice: (id: number, deviceId: number) => request.delete(`/projects/${id}/devices/${deviceId}`),
  batchBindDevices: (id: number, deviceIds: number[]) => request.post(`/projects/${id}/devices/batch`, deviceIds),
  batchUnbindDevices: (id: number, deviceIds: number[]) => request.delete(`/projects/${id}/devices/batch`, { data: deviceIds }),
};

// ==================== Auth API ====================
export const authApi = {
  login: (data: Record<string, unknown>) => request.post('/auth/login', data),
  sendSms: (phone: string, purpose: string) => request.post('/auth/sms/send', { phone, purpose }),
  refresh: (refreshToken: string) => request.post('/auth/refresh', { refreshToken }),
  logout: () => request.post('/auth/logout'),
  logoutAll: () => request.post('/auth/logout-all'),
};

// ==================== Session API ====================
export const sessionApi = {
  list: () => request.get('/user/sessions'),
  kick: (sessionId: number) => request.delete(`/user/sessions/${sessionId}`),
  updatePushToken: (pushToken: string, pushChannel?: string) =>
    request.put('/user/push-token', { pushToken, pushChannel }),
  listOauthBindings: () => request.get('/user/oauth-bindings'),
  deleteOauthBinding: (id: number) => request.delete(`/user/oauth-bindings/${id}`),
};

// ==================== Admin Session API ====================
export const adminSessionApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/admin-sessions/list', data),
  kickSession: (sessionId: number) => request.delete(`/admin-sessions/${sessionId}`),
  kickUser: (username: string) => request.post(`/admin-sessions/users/${encodeURIComponent(username)}/kick`),
};

// ==================== Login Log API ====================
export const loginLogApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/login-logs/list', data),
};

// ==================== API Key API ====================
export const openApiApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/platform/open-apis/list', data),
  get: (code: string) => request.get(`/platform/open-apis/${encodeURIComponent(code)}`),
  options: () => request.get('/platform/open-apis/options'),
};

// ==================== App Key API ====================
export const apiKeyApi = {
  list: (data: Record<string, unknown> = {}) => request.post('/app-keys/list', data),
  get: (id: number) => request.get(`/app-keys/${id}`),
  create: (data: Record<string, unknown>) => request.post('/app-keys', data),
  update: (id: number, data: Record<string, unknown>) => request.put(`/app-keys/${id}`, data),
  updateStatus: (id: number, status: string) => request.put(`/app-keys/${id}/status?status=${status}`),
  delete: (id: number) => request.delete(`/app-keys/${id}`),
  listOpenApiOptions: () => request.get('/app-keys/open-api-options'),
  getOpenApiDocs: () => request.get('/app-keys/open-api-docs'),
  queryLogs: (id: number, data?: Record<string, unknown>) => request.post(`/app-keys/${id}/logs`, data),
  queryStats: (id: number, startDate: string, endDate: string) =>
    request.get(`/app-keys/${id}/stats`, { params: { startDate, endDate } }),
};

// ==================== Device Message API ====================
export const deviceMessageApi = {
  publishDownstream: (data: Record<string, unknown>) => deviceRequest.post('/device-messages/downstream', data),
  setProperty: (deviceId: number, properties: Record<string, unknown>) => deviceRequest.post(`/device-messages/property-set?deviceId=${deviceId}`, properties),
  invokeService: (deviceId: number, serviceName: string, params: Record<string, unknown>) => deviceRequest.post(`/device-messages/service-invoke?deviceId=${deviceId}&serviceName=${serviceName}`, params),
};

// ==================== Tenant Menu Config API ====================
// ==================== In-App Message (站内信) API ====================
export const inAppMessageApi = {
  list: (data: Record<string, unknown> = {}) => supportRequest.post('/in-app-messages/list', data),
  unreadCount: () => supportRequest.get('/in-app-messages/unread-count'),
  markAsRead: (id: number) => supportRequest.put(`/in-app-messages/${id}/read`),
  markAllAsRead: () => supportRequest.put('/in-app-messages/read-all'),
  delete: (id: number) => supportRequest.delete(`/in-app-messages/${id}`),
  send: (data: Record<string, unknown>) => supportRequest.post('/in-app-messages', data),
};
