import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Suspense } from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  DownOutlined,
  EditOutlined,
  KeyOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { TenantSelect } from '../../components/EntitySelect';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { tenantApi } from '../../services/api';
import TenantOpenApiSubscriptionDrawer from './TenantOpenApiSubscriptionDrawer';
import TenantWebhookDrawer from './TenantWebhookDrawer';
import { generateRandomPassword } from '../../utils/password';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

const { RangePicker } = DatePicker;
const TenantTrendChart = React.lazy(() => import('./TenantTrendChart'));

type TenantStatus = 'PENDING' | 'INITIALIZING' | 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE' | 'DEACTIVATING' | 'DELETED';
type IsolationLevel = 'SHARED_RLS' | 'SCHEMA' | 'DATABASE';

interface TenantItem {
  id: number;
  code: string;
  name: string;
  displayName?: string;
  description?: string;
  logoUrl?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  status?: TenantStatus;
  isolationLevel?: IsolationLevel;
  createdAt?: string;
}

interface TenantOverview {
  totalTenants?: number;
  activeTenants?: number;
  suspendedTenants?: number;
}

interface TenantFormValues {
  code?: string;
  name?: string;
  displayName?: string;
  description?: string;
  logoUrl?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  isolationLevel?: IsolationLevel;
  adminUser?: {
    username?: string;
    password?: string;
    phone?: string;
    email?: string;
    realName?: string;
  };
}

interface TenantQueryValues {
  keyword?: string;
  status?: TenantStatus;
}

interface TenantUsage {
  deviceCount?: number;
  deviceOnlineCount?: number;
  currentMsgRate?: number;
  ruleCount?: number;
  apiCallsToday?: number;
  otaStorageBytes?: number;
  videoChannelActive?: number;
  videoStorageBytes?: number;
  userCount?: number;
  projectCount?: number;
  sharePolicyCount?: number;
  updatedAt?: string;
}

interface TenantUsageDaily {
  date: string;
  deviceCount?: number;
  deviceOnlinePeak?: number;
  messageCount?: number;
  messageRatePeak?: number;
  ruleCount?: number;
  apiCallCount?: number;
  storageBytes?: number;
  videoChannelCount?: number;
  videoStorageBytes?: number;
}

interface TenantSpaceMenuItem {
  menuKey: string;
  label: string;
  icon?: string | null;
  menuType?: 'GROUP' | 'PAGE' | string;
  routePath?: string | null;
  sortOrder?: number;
  visible?: boolean;
  selected?: boolean;
  children?: TenantSpaceMenuItem[];
}

interface TenantSpaceAuthorization {
  menuTree: TenantSpaceMenuItem[];
  selectedMenuKeys: string[];
}

type TrendMetricKey =
  | 'deviceCount'
  | 'deviceOnlinePeak'
  | 'messageCount'
  | 'messageRatePeak'
  | 'ruleCount'
  | 'apiCallCount'
  | 'storageBytes'
  | 'videoChannelCount'
  | 'videoStorageBytes';

interface StatusDialogState {
  record: TenantItem;
  target: 'ACTIVE' | 'SUSPENDED';
}

interface PasswordResult {
  tenantName: string;
  password: string;
}

const statusLabels: Record<TenantStatus, string> = {
  PENDING: '待处理',
  INITIALIZING: '初始化中',
  ACTIVE: '启用',
  SUSPENDED: '暂停',
  MAINTENANCE: '维护中',
  DEACTIVATING: '注销中',
  DELETED: '已删除',
};

const statusColors: Record<TenantStatus, string> = {
  PENDING: 'default',
  INITIALIZING: 'processing',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  MAINTENANCE: 'processing',
  DEACTIVATING: 'error',
  DELETED: 'default',
};

const isolationLabels: Record<IsolationLevel, string> = {
  SHARED_RLS: '共享库 + 行级隔离',
  SCHEMA: '独立 Schema',
  DATABASE: '独立数据库',
};

const trendMetricOptions: Array<{ value: TrendMetricKey; label: string; isByte?: boolean }> = [
  { value: 'deviceCount', label: '设备数' },
  { value: 'deviceOnlinePeak', label: '在线设备峰值' },
  { value: 'messageCount', label: '消息量' },
  { value: 'messageRatePeak', label: '消息速率峰值' },
  { value: 'ruleCount', label: '规则数' },
  { value: 'apiCallCount', label: 'API 调用量' },
  { value: 'storageBytes', label: '存储量', isByte: true },
  { value: 'videoChannelCount', label: '视频通道数' },
  { value: 'videoStorageBytes', label: '视频存储量', isByte: true },
];

const defaultTrendRange = (): [Dayjs, Dayjs] => [dayjs().subtract(6, 'day'), dayjs()];

const formatBytes = (value?: number): string => {
  if (value == null || Number.isNaN(value)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(2)} ${units[unitIndex]}`;
};

const formatMetricValue = (value: number, metric: TrendMetricKey): string => {
  const metricMeta = trendMetricOptions.find((item) => item.value === metric);
  return metricMeta?.isByte ? formatBytes(value) : value.toLocaleString();
};

const buildTenantSpaceTreeData = (nodes: TenantSpaceMenuItem[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.menuKey,
    title: (
      <Space direction="vertical" size={0}>
        <span>{node.label}</span>
        {node.routePath ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {node.routePath}
          </Typography.Text>
        ) : null}
      </Space>
    ),
    disableCheckbox: node.menuType !== 'PAGE' || node.visible === false,
    selectable: false,
    children: Array.isArray(node.children) && node.children.length > 0 ? buildTenantSpaceTreeData(node.children) : undefined,
  }));

const collectGrantableMenuKeys = (nodes: TenantSpaceMenuItem[]): string[] => {
  const keys: string[] = [];
  const walk = (items: TenantSpaceMenuItem[]) => {
    items.forEach((item) => {
      if (item.menuType === 'PAGE' && item.visible !== false) {
        keys.push(item.menuKey);
      }
      if (Array.isArray(item.children) && item.children.length > 0) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return keys;
};

const isSystemOpsTenant = (tenant?: TenantItem | null): boolean => tenant?.code === 'system-ops';

const TenantList: React.FC = () => {
  const [queryForm] = Form.useForm<TenantQueryValues>();
  const [editForm] = Form.useForm<TenantFormValues>();

  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [spaceLoading, setSpaceLoading] = useState(false);
  const [spaceSubmitting, setSpaceSubmitting] = useState(false);
  const [spaceDirty, setSpaceDirty] = useState(false);
  const [editDirty, setEditDirty] = useState(false);

  const [items, setItems] = useState<TenantItem[]>([]);
  const [overview, setOverview] = useState<TenantOverview>({});
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<TenantQueryValues>({});
  const [reloadToken, setReloadToken] = useState(0);

  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [openApiOpen, setOpenApiOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<TenantItem | null>(null);

  const [usageTenant, setUsageTenant] = useState<TenantItem | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [usageDaily, setUsageDaily] = useState<TenantUsageDaily[]>([]);
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>('deviceCount');
  const [trendRange, setTrendRange] = useState<[Dayjs, Dayjs]>(defaultTrendRange);
  const [spaceMenuTree, setSpaceMenuTree] = useState<TenantSpaceMenuItem[]>([]);
  const [checkedSpaceKeys, setCheckedSpaceKeys] = useState<string[]>([]);

  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [deactivateDialog, setDeactivateDialog] = useState<TenantItem | null>(null);
  const [deactivateConfirmCode, setDeactivateConfirmCode] = useState('');
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState<TenantItem | null>(null);
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);
  const [passwordResult, setPasswordResult] = useState<PasswordResult | null>(null);

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(editOpen && editDirty);
  useDirtyGuard(spaceOpen && spaceDirty);
  // 布局在切换页签时会广播激活事件；忽略与首次挂载同一轮触发的事件，避免刚打开页面就请求两次。
  const activationReadyRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      activationReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  usePageActivation(() => {
    if (!activationReadyRef.current) {
      return;
    }
    setReloadToken((current) => current + 1);
  });

  const tenantSpaceTreeData = useMemo(() => buildTenantSpaceTreeData(spaceMenuTree), [spaceMenuTree]);
  const allTenantSpaceKeys = useMemo(() => collectGrantableMenuKeys(spaceMenuTree), [spaceMenuTree]);

  const tenantRequestIdRef = useRef(0);
  const overviewRequestIdRef = useRef(0);

  const fetchTenants = async () => {
    const requestId = tenantRequestIdRef.current + 1;
    tenantRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await tenantApi.list({ pageNum, pageSize, ...filters });
      if (requestId !== tenantRequestIdRef.current) {
        return;
      }
      const page = (res.data?.data ?? {}) as { records?: TenantItem[]; total?: number };
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      if (requestId !== tenantRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载租户列表失败'));
    } finally {
      if (requestId === tenantRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchOverview = async () => {
    const requestId = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;
    setOverviewLoading(true);
    try {
      const res = await tenantApi.overview();
      if (requestId !== overviewRequestIdRef.current) {
        return;
      }
      setOverview((res.data?.data ?? {}) as TenantOverview);
    } catch (error) {
      if (requestId !== overviewRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载租户概览失败'));
    } finally {
      if (requestId === overviewRequestIdRef.current) {
        setOverviewLoading(false);
      }
    }
  };

  const usageRequestIdRef = useRef(0);
  const usageTenantIdRef = useRef<number | null>(null);

  const fetchUsageData = async (tenant: TenantItem, range = trendRange) => {
    const requestId = usageRequestIdRef.current + 1;
    usageRequestIdRef.current = requestId;
    setUsageLoading(true);
    try {
      const [usageRes, usageDailyRes] = await Promise.all([
        tenantApi.getUsage(tenant.id),
        tenantApi.getUsageDaily(tenant.id, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')),
      ]);
      // 快速切换租户时旧请求可能后返回，丢弃过期结果避免展示错租户的数据。
      if (requestId !== usageRequestIdRef.current) {
        return;
      }
      setUsage((usageRes.data?.data ?? null) as TenantUsage | null);
      setUsageDaily((usageDailyRes.data?.data ?? []) as TenantUsageDaily[]);
    } catch (error) {
      if (requestId !== usageRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载租户用量失败'));
      setUsage(null);
      setUsageDaily([]);
    } finally {
      if (requestId === usageRequestIdRef.current) {
        setUsageLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchTenants();
  }, [pageNum, pageSize, filters, reloadToken]);

  useEffect(() => {
    void fetchOverview();
  }, [reloadToken]);

  useEffect(() => {
    if (!usageTenant && items.length > 0) {
      setUsageTenant(items[0]);
      return;
    }
    if (usageTenant) {
      const matched = items.find((item) => item.id === usageTenant.id);
      // 只同步发生变化的字段，避免把不同的对象引用写回 state 造成重复渲染。
      if (matched && (matched.name !== usageTenant.name
        || matched.code !== usageTenant.code
        || matched.status !== usageTenant.status)) {
        setUsageTenant(matched);
      }
    }
  }, [items, usageTenant]);

  useEffect(() => {
    if (!usageTenant) {
      usageTenantIdRef.current = null;
      return;
    }
    if (usageTenantIdRef.current !== usageTenant.id) {
      // 切换租户时先清空旧数据，避免在新租户名称下短暂展示上一个租户的统计值。
      usageTenantIdRef.current = usageTenant.id;
      setUsage(null);
      setUsageDaily([]);
    }
    void fetchUsageData(usageTenant, trendRange);
  }, [usageTenant?.id, trendRange, reloadToken]);

  const refreshAll = () => {
    setReloadToken((current) => current + 1);
  };

  const openCreateModal = () => {
    setEditingTenant(null);
    setEditDirty(false);
    editForm.resetFields();
    editForm.setFieldsValue({ isolationLevel: 'SHARED_RLS' });
    setEditOpen(true);
  };

  const openEditModal = (record: TenantItem) => {
    setEditingTenant(record);
    setEditDirty(false);
    editForm.setFieldsValue({
      name: record.name,
      displayName: record.displayName,
      description: record.description,
      logoUrl: record.logoUrl,
      contactName: record.contactName,
      contactPhone: record.contactPhone,
      contactEmail: record.contactEmail,
    });
    setEditOpen(true);
  };

  const closeEditDrawer = () => {
    confirmDiscard(editDirty, () => {
      setEditOpen(false);
      setEditDirty(false);
    });
  };

  const handleSaveTenant = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      if (editingTenant) {
        await tenantApi.update(editingTenant.id, {
          name: values.name,
          displayName: values.displayName,
          description: values.description,
          logoUrl: values.logoUrl,
          contactName: values.contactName,
          contactPhone: values.contactPhone,
          contactEmail: values.contactEmail,
        });
        message.success('租户信息已更新');
      } else {
        await tenantApi.create({
          code: values.code ?? '',
          name: values.name ?? '',
          displayName: values.displayName,
          description: values.description,
          contactName: values.contactName,
          contactPhone: values.contactPhone,
          contactEmail: values.contactEmail,
          isolationLevel: values.isolationLevel,
          adminUser: {
            username: values.adminUser?.username ?? '',
            password: values.adminUser?.password ?? '',
            phone: values.adminUser?.phone,
            email: values.adminUser?.email,
            realName: values.adminUser?.realName,
          },
        });
        message.success('租户创建成功');
      }
      setEditDirty(false);
      setEditOpen(false);
      refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '保存租户失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const openSuspendDialog = (record: TenantItem) => {
    setStatusReason('');
    setStatusDialog({ record, target: 'SUSPENDED' });
  };

  const openEnableDialog = (record: TenantItem) => {
    setStatusReason('');
    setStatusDialog({ record, target: 'ACTIVE' });
  };

  const handleConfirmStatus = async () => {
    if (!statusDialog) {
      return;
    }
    if (statusDialog.target === 'SUSPENDED' && !statusReason.trim()) {
      message.warning('请填写暂停原因，便于租户和其他管理员了解影响原因');
      return;
    }
    setStatusSubmitting(true);
    try {
      await tenantApi.updateStatus(
        statusDialog.record.id,
        statusDialog.target,
        statusDialog.target === 'SUSPENDED' ? statusReason.trim() : undefined,
      );
      message.success(statusDialog.target === 'ACTIVE' ? '租户已恢复启用' : '租户已暂停');
      setStatusDialog(null);
      setStatusReason('');
      refreshAll();
    } catch (error) {
      // 失败时不关闭弹窗，避免用户误以为状态已经变更。
      message.error(getErrorMessage(error, '更新租户状态失败'));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const openDeactivateDialog = (record: TenantItem) => {
    setDeactivateConfirmCode('');
    setDeactivateDialog(record);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateDialog) {
      return;
    }
    if (deactivateConfirmCode.trim() !== deactivateDialog.code) {
      message.warning('输入的租户编码与当前租户不一致');
      return;
    }
    setDeactivateSubmitting(true);
    try {
      await tenantApi.deactivate(deactivateDialog.id);
      message.success('已发起租户注销');
      if (usageTenant?.id === deactivateDialog.id) {
        // 被注销的租户不应继续出现在用量统计中。
        setUsageTenant(null);
        setUsage(null);
        setUsageDaily([]);
      }
      setDeactivateDialog(null);
      setDeactivateConfirmCode('');
      refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '注销租户失败'));
    } finally {
      setDeactivateSubmitting(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordDialog) {
      return;
    }
    const newPassword = generateRandomPassword();
    setResetPasswordSubmitting(true);
    try {
      await tenantApi.resetAdminPassword(resetPasswordDialog.id, newPassword);
      setPasswordResult({ tenantName: resetPasswordDialog.name, password: newPassword });
      setResetPasswordDialog(null);
    } catch (error) {
      message.error(getErrorMessage(error, '重置超级管理员密码失败'));
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  const openSpaceModal = async (record: TenantItem) => {
    setCurrentTenant(record);
    setSpaceLoading(true);
    setSpaceDirty(false);
    try {
      const res = await tenantApi.getSpaceMenus(record.id);
      const data = (res.data?.data ?? {}) as TenantSpaceAuthorization;
      setSpaceMenuTree(data.menuTree ?? []);
      setCheckedSpaceKeys(data.selectedMenuKeys ?? []);
      setSpaceOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户空间授权失败'));
    } finally {
      setSpaceLoading(false);
    }
  };

  const closeSpaceDrawer = () => {
    confirmDiscard(spaceDirty, () => {
      setSpaceOpen(false);
      setSpaceDirty(false);
    });
  };

  const openWebhookDrawer = (record: TenantItem) => {
    setCurrentTenant(record);
    setWebhookOpen(true);
  };

  const openOpenApiDrawer = (record: TenantItem) => {
    setCurrentTenant(record);
    setOpenApiOpen(true);
  };

  const handleSaveSpaceMenus = async () => {
    if (!currentTenant) return;
    if (checkedSpaceKeys.length === 0) {
      message.warning('请至少选择一个租户空间功能');
      return;
    }

    try {
      setSpaceSubmitting(true);
      await tenantApi.updateSpaceMenus(currentTenant.id, { menuKeys: checkedSpaceKeys });
      message.success('租户空间授权已更新');
      setSpaceDirty(false);
      setSpaceOpen(false);
    } catch (error) {
      message.error(getErrorMessage(error, '保存租户空间授权失败'));
    } finally {
      setSpaceSubmitting(false);
    }
  };

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    setPageNum(1);
    setFilters({ keyword: values.keyword?.trim() || undefined, status: values.status });
  };

  const handleReset = () => {
    queryForm.resetFields();
    setPageNum(1);
    setFilters({});
  };

  const handleUsageTenantChange = async (tenantId?: number) => {
    if (!tenantId) {
      setUsageTenant(null);
      return;
    }
    const localTenant = items.find((item) => item.id === tenantId);
    if (localTenant) {
      setUsageTenant(localTenant);
      return;
    }
    try {
      const res = await tenantApi.get(tenantId);
      const detail = res.data?.data as TenantItem | undefined;
      if (detail) {
        setUsageTenant({
          id: detail.id,
          name: detail.name,
          code: detail.code,
          status: detail.status,
        });
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户信息失败，请重试'));
    }
  };

  const buildMoreActionItems = (record: TenantItem): MenuProps['items'] => {
    const actionItems: MenuProps['items'] = [
      {
        key: 'reset-admin-password',
        icon: <KeyOutlined />,
        label: '重置超管密码',
        onClick: () => setResetPasswordDialog(record),
      },
    ];

    if (!isSystemOpsTenant(record)) {
      actionItems.push(
        {
          key: 'open-api-subscription',
          icon: <ApiOutlined />,
          label: 'OpenAPI订阅',
          onClick: () => openOpenApiDrawer(record),
        },
        {
          key: 'space-menus',
          icon: <AppstoreOutlined />,
          label: '空间授权',
          onClick: () => void openSpaceModal(record),
        },
        {
          key: 'webhook',
          icon: <ApiOutlined />,
          label: 'Webhook',
          onClick: () => openWebhookDrawer(record),
        },
      );
    }

    actionItems.push(
      { type: 'divider' },
      {
        key: 'deactivate',
        icon: <StopOutlined />,
        danger: true,
        label: '注销租户',
        onClick: () => openDeactivateDialog(record),
      },
    );

    return actionItems;
  };

  const columns: ColumnsType<TenantItem> = [
      {
        title: '编码',
        dataIndex: 'code',
        width: 190,
        render: (value: string) => <CopyText text={value} ellipsis />,
      },
      { title: '名称', dataIndex: 'name', width: 180 },
      { title: '展示名', dataIndex: 'displayName', width: 180, render: (value?: string) => value || '-' },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value?: TenantStatus) => (value ? <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> : '-'),
      },
      {
        title: '隔离级别',
        dataIndex: 'isolationLevel',
        width: 160,
        render: (value?: IsolationLevel) => (value ? isolationLabels[value] : '-'),
      },
      { title: '联系人', dataIndex: 'contactName', width: 120, render: (value?: string) => value || '-' },
      { title: '联系电话', dataIndex: 'contactPhone', width: 140, render: (value?: string) => value || '-' },
      { title: '联系邮箱', dataIndex: 'contactEmail', width: 200, render: (value?: string) => value || '-' },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: string) => (value ? formatDateTime(value) : '-'),
      },
      {
        title: '操作',
        key: 'action',
        fixed: 'right',
        width: 300,
        render: (_value: unknown, record) => (
          <Space size="small" wrap>
            <Button type="link" size="small" icon={<BarChartOutlined />} onClick={() => setUsageTenant(record)}>用量</Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
            {record.status === 'SUSPENDED' ? (
              <Button type="link" size="small" onClick={() => openEnableDialog(record)}>启用</Button>
            ) : (
              <Button
                type="link"
                size="small"
                icon={<StopOutlined />}
                disabled={record.status === 'DELETED' || record.status === 'DEACTIVATING'}
                onClick={() => openSuspendDialog(record)}
              >
                暂停
              </Button>
            )}
            <Dropdown menu={{ items: buildMoreActionItems(record) }} trigger={['click']}>
              <Button type="link" size="small" icon={<MoreOutlined />}>
                更多
                <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
          </Space>
        ),
      },
    ];

  const trendChartData = useMemo(
    // 趋势图必须按日期升序，否则后端返回倒序时会画出折返的折线。
    () => [...usageDaily]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((item) => ({ date: item.date, value: Number(item[trendMetric] ?? 0) })),
    [trendMetric, usageDaily],
  );

  const selectedTrendMetric = trendMetricOptions.find((item) => item.value === trendMetric);

  const usageStats = [
    { title: '当前设备数', value: usage?.deviceCount ?? 0 },
    { title: '在线设备数', value: usage?.deviceOnlineCount ?? 0 },
    { title: '当前消息速率', value: usage?.currentMsgRate ?? 0, precision: 2 },
    { title: '今日 API 调用', value: usage?.apiCallsToday ?? 0 },
    { title: '用户数', value: usage?.userCount ?? 0 },
    { title: '项目数', value: usage?.projectCount ?? 0 },
    { title: '规则数', value: usage?.ruleCount ?? 0 },
    { title: '共享策略数', value: usage?.sharePolicyCount ?? 0 },
    { title: 'OTA 存储', value: formatBytes(usage?.otaStorageBytes) },
    { title: '视频通道数', value: usage?.videoChannelActive ?? 0 },
    { title: '视频存储', value: formatBytes(usage?.videoStorageBytes) },
  ];

  const hasQueryFilters = Boolean(filters.keyword || filters.status);
  const usagePinnedLabel = usageTenant
    ? `${usageTenant.name}${usageTenant.code ? `（${usageTenant.code}）` : ''}`
    : undefined;

  return (
    <div>
      <PageHeader
        title="租户管理"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建租户</Button>
          </Space>
        )}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card loading={overviewLoading}>
            <Statistic title="租户总数（全局）" value={overview.totalTenants ?? 0} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={overviewLoading}>
            <Statistic title="启用租户（全局）" value={overview.activeTenants ?? 0} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={overviewLoading}>
            <Statistic title="暂停租户（全局）" value={overview.suspendedTenants ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字"><Input allowClear placeholder="租户编码/名称" style={{ width: 220 }} /></Form.Item>
          <Form.Item name="status" label="状态"><Select allowClear placeholder="全部状态" style={{ width: 160 }} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item><Space><Button type="primary" htmlType="submit">查询</Button><Button onClick={handleReset}>重置</Button></Space></Form.Item>
        </Form>

        <Table<TenantItem>
          rowKey="id"
          style={{ marginTop: 16 }}
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1790 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasQueryFilters}
                emptyText="暂无租户，请先新建租户"
                filteredText="没有符合当前筛选条件的租户"
                onClearFilters={handleReset}
              />
            ),
          }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPageNum(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Card
        style={{ marginTop: 16 }}
        title="用量统计 / 趋势图"
        extra={
          <Space wrap>
            <TenantSelect
              value={usageTenant?.id}
              pinnedLabel={usagePinnedLabel}
              placeholder="输入租户名称或编码搜索"
              style={{ width: 260 }}
              onChange={(tenantId) => void handleUsageTenantChange(tenantId)}
            />
            <Select
              value={trendMetric}
              style={{ width: 180 }}
              options={trendMetricOptions.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value: TrendMetricKey) => setTrendMetric(value)}
            />
            <RangePicker
              allowClear={false}
              value={trendRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) setTrendRange(dates as [Dayjs, Dayjs]);
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { if (usageTenant) void fetchUsageData(usageTenant); }}>刷新</Button>
          </Space>
        }
      >
        {!usageTenant ? (
          <Empty description="请选择要查看用量的租户" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={12} wrap>
                <Typography.Text strong>{usageTenant.name}</Typography.Text>
                <Tag>{usageTenant.code}</Tag>
                {usageTenant.status && <Tag color={statusColors[usageTenant.status]}>{statusLabels[usageTenant.status]}</Tag>}
              </Space>
              <Typography.Text type="secondary">
                最近更新时间：{usage?.updatedAt ? formatDateTime(usage.updatedAt) : '-'}
              </Typography.Text>
            </div>

            <Row gutter={[16, 16]}>
              {usageStats.map((item) => (
                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={item.title}>
                  <Card size="small">
                    {typeof item.value === 'string' ? (
                      <Statistic title={item.title} value={item.value} />
                    ) : (
                      <Statistic title={item.title} value={item.value} precision={'precision' in item ? item.precision : 0} />
                    )}
                  </Card>
                </Col>
              ))}
            </Row>

            <Card size="small" title={selectedTrendMetric ? `${selectedTrendMetric.label}趋势` : '趋势图'} extra={<Typography.Text type="secondary">按日统计</Typography.Text>}>
              {usageLoading ? (
                <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
              ) : trendChartData.length > 0 ? (
                <Suspense fallback={<div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>}>
                  <TenantTrendChart
                    data={trendChartData}
                    metricLabel={selectedTrendMetric?.label}
                    formatValue={(value) => formatMetricValue(value, trendMetric)}
                  />
                </Suspense>
              ) : (
                <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="当前时间范围暂无趋势数据" /></div>
              )}
            </Card>
          </Space>
        )}
      </Card>

      <Drawer
        destroyOnClose
        title={editingTenant ? '编辑租户' : '新建租户'}
        open={editOpen}
        onClose={closeEditDrawer}
        width={920}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEditDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSaveTenant()}>
              {editingTenant ? '保存修改' : '创建租户'}
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" onValuesChange={() => setEditDirty(true)}>
          <Row gutter={16}>
            {!editingTenant && (
              <>
                <Col span={12}>
                  <Form.Item name="code" label="租户编码" rules={[{ required: true, message: '请输入租户编码' }, { max: 64, message: '租户编码长度不能超过 64 位' }, { pattern: /^[A-Za-z0-9_-]{2,63}$/, message: '租户编码仅支持大小写字母、数字、中划线和下划线' }]}>
                    <Input placeholder="例如 Acme-Prod_01" />
                  </Form.Item>
                </Col>
                <Col span={12}><Form.Item name="isolationLevel" label="隔离级别" rules={[{ required: true, message: '请选择隔离级别' }]}><Select options={Object.entries(isolationLabels).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
              </>
            )}
            <Col span={12}><Form.Item name="name" label="租户名称" rules={[{ required: true, message: '请输入租户名称' }, { max: 256, message: '租户名称长度不能超过 256 位' }]}><Input placeholder="请输入租户名称" /></Form.Item></Col>
            <Col span={12}><Form.Item name="displayName" label="展示名称" rules={[{ max: 256, message: '展示名称长度不能超过 256 位' }]}><Input placeholder="可选" /></Form.Item></Col>
            <Col span={12}><Form.Item name="contactName" label="联系人"><Input placeholder="可选" /></Form.Item></Col>
            <Col span={12}><Form.Item name="contactPhone" label="联系电话"><Input placeholder="可选" /></Form.Item></Col>
            <Col span={12}><Form.Item name="contactEmail" label="联系邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}><Input placeholder="可选" /></Form.Item></Col>
            {editingTenant && <Col span={12}><Form.Item name="logoUrl" label="Logo 地址"><Input placeholder="可选" /></Form.Item></Col>}
            <Col span={24}><Form.Item name="description" label="描述"><Input.TextArea rows={3} placeholder="可选" /></Form.Item></Col>
          </Row>

          {!editingTenant && (
            <Card size="small" title="初始管理员信息">
              <Row gutter={16}>
                <Col span={12}><Form.Item name={['adminUser', 'username']} label="管理员账号" rules={[{ required: true, message: '请输入管理员账号' }]}><Input placeholder="请输入管理员账号" /></Form.Item></Col>
                <Col span={12}><Form.Item name={['adminUser', 'password']} label="管理员密码" rules={[{ required: true, message: '请输入管理员密码' }]}><Input.Password placeholder="请输入管理员密码" /></Form.Item></Col>
                <Col span={12}>
                  <Form.Item label="登录展示名" extra="自动使用租户展示名称；若未填写展示名称，则使用租户名称">
                    <Input placeholder="自动生成" disabled />
                  </Form.Item>
                </Col>
                <Col span={12}><Form.Item name={['adminUser', 'phone']} label="手机号"><Input placeholder="可选" /></Form.Item></Col>
                <Col span={12}><Form.Item name={['adminUser', 'email']} label="邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}><Input placeholder="可选" /></Form.Item></Col>
              </Row>
            </Card>
          )}
        </Form>
      </Drawer>

      <Drawer
        destroyOnClose
        title={`空间授权${currentTenant ? ` - ${currentTenant.name}` : ''}`}
        open={spaceOpen}
        onClose={closeSpaceDrawer}
        width={860}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeSpaceDrawer}>取消</Button>
            <Button type="primary" loading={spaceSubmitting} onClick={() => void handleSaveSpaceMenus()}>
              保存授权
            </Button>
          </Space>
        }
      >
        {spaceLoading ? (
          <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small">
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                勾选后，租户业务空间仅展示并允许访问这些功能页面，系统运维租户不支持该授权。
              </Typography.Paragraph>
            </Card>
            <Card
              size="small"
              title="租户空间功能"
              extra={(
                <Space size={8}>
                  <Typography.Text type="secondary">已选 {checkedSpaceKeys.length} / 全部 {allTenantSpaceKeys.length} 项</Typography.Text>
                  <Button
                    size="small"
                    onClick={() => {
                      setCheckedSpaceKeys(allTenantSpaceKeys);
                      setSpaceDirty(true);
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setCheckedSpaceKeys([]);
                      setSpaceDirty(true);
                    }}
                  >
                    清空
                  </Button>
                </Space>
              )}
            >
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                勾选后租户可见并可访问对应页面；取消后菜单会隐藏，并禁止直接访问。
              </Typography.Paragraph>
              <Tree
                checkable
                defaultExpandAll
                checkedKeys={checkedSpaceKeys}
                treeData={tenantSpaceTreeData}
                onCheck={(checkedKeysValue) => {
                  const nextKeys = Array.isArray(checkedKeysValue)
                    ? (checkedKeysValue as string[])
                    : (checkedKeysValue.checked as string[]);
                  setCheckedSpaceKeys(nextKeys.filter((key) => allTenantSpaceKeys.includes(key)));
                  setSpaceDirty(true);
                }}
              />
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(statusDialog)}
        title={statusDialog?.target === 'ACTIVE' ? '启用租户' : '暂停租户'}
        okText={statusDialog?.target === 'ACTIVE' ? '确认启用' : '确认暂停'}
        cancelText="取消"
        okButtonProps={{ danger: statusDialog?.target === 'SUSPENDED' }}
        confirmLoading={statusSubmitting}
        maskClosable={!statusSubmitting}
        onCancel={() => {
          if (!statusSubmitting) {
            setStatusDialog(null);
            setStatusReason('');
          }
        }}
        onOk={() => void handleConfirmStatus()}
        destroyOnClose
      >
        {statusDialog ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>
              租户：<Typography.Text strong>{statusDialog.record.name}</Typography.Text>
              （{statusDialog.record.code}）
            </Typography.Text>
            {statusDialog.target === 'SUSPENDED' ? (
              <>
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  message="暂停后的影响"
                  description={(
                    <Space direction="vertical" size={4}>
                      <span>该租户下的全部用户将无法登录，租户 API 调用与设备接入会被拒绝。</span>
                      <span>恢复方式：在租户列表点击“启用”，租户状态恢复后用户即可重新登录。</span>
                    </Space>
                  )}
                />
                <div>
                  <Typography.Text>暂停原因（必填）</Typography.Text>
                  <Input.TextArea
                    value={statusReason}
                    maxLength={200}
                    showCount
                    rows={3}
                    placeholder="例如：客户欠费、合同到期或安全事件处置"
                    onChange={(event) => setStatusReason(event.target.value)}
                    style={{ marginTop: 8 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    原因会记录在租户暂停信息中，供后续恢复和审计时参考。
                  </Typography.Text>
                </div>
              </>
            ) : (
              <>
                <Alert
                  type="info"
                  showIcon
                  message="启用后的影响"
                  description="启用后该租户的全部用户可重新登录，租户下接口调用与设备接入恢复正常。"
                />
                {statusDialog.record.status === 'SUSPENDED' ? (
                  <Typography.Text type="secondary">
                    当前租户为暂停状态，启用后会清除暂停原因和暂停时间。
                  </Typography.Text>
                ) : null}
              </>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deactivateDialog)}
        title="注销租户"
        okText="确认注销"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={deactivateSubmitting}
        maskClosable={!deactivateSubmitting}
        onCancel={() => {
          if (!deactivateSubmitting) {
            setDeactivateDialog(null);
            setDeactivateConfirmCode('');
          }
        }}
        onOk={() => void handleConfirmDeactivate()}
        destroyOnClose
      >
        {deactivateDialog ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message="注销是不可恢复的高危操作"
              description={(
                <Space direction="vertical" size={4}>
                  <span>注销后该租户的全部用户将立即无法登录。</span>
                  <span>租户会退出租户列表并进入注销流程，无法在控制台自行恢复；如需恢复必须联系平台运维处理。</span>
                  <span>租户下的业务数据按平台数据保留策略处理，建议先完成数据备份或导出。</span>
                </Space>
              )}
            />
            <div>
              <Typography.Text>
                请输入租户编码 <Typography.Text code>{deactivateDialog.code}</Typography.Text> 以再次确认：
              </Typography.Text>
              <Input
                value={deactivateConfirmCode}
                placeholder={deactivateDialog.code}
                onChange={(event) => setDeactivateConfirmCode(event.target.value)}
                style={{ marginTop: 8 }}
                autoComplete="off"
              />
            </div>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(resetPasswordDialog)}
        title="重置租户超级管理员密码"
        okText="重置密码"
        cancelText="取消"
        confirmLoading={resetPasswordSubmitting}
        maskClosable={!resetPasswordSubmitting}
        onCancel={() => {
          if (!resetPasswordSubmitting) {
            setResetPasswordDialog(null);
          }
        }}
        onOk={() => void handleConfirmResetPassword()}
        destroyOnClose
      >
        {resetPasswordDialog ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              将为租户 <Typography.Text strong>{resetPasswordDialog.name}</Typography.Text> 的超级管理员生成新的随机密码。
            </Typography.Text>
            <Typography.Text>重置后该超级管理员的旧密码立即失效，需要使用新密码重新登录。</Typography.Text>
            <Typography.Text type="secondary">新密码只展示一次，请确保可以复制并转交给租户。</Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(passwordResult)}
        title="超级管理员密码已重置"
        okText="我已保存，关闭"
        maskClosable={false}
        keyboard={false}
        closable={false}
        onOk={() => setPasswordResult(null)}
        onCancel={() => setPasswordResult(null)}
        destroyOnClose
      >
        {passwordResult ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>
              租户 <Typography.Text strong>{passwordResult.tenantName}</Typography.Text> 的超级管理员新密码如下，请及时通知对方登录后修改。
            </Typography.Text>
            <Typography.Paragraph
              copyable={{ text: passwordResult.password, tooltips: ['复制密码', '已复制'] }}
              style={{
                marginBottom: 0,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: 16,
              }}
            >
              {passwordResult.password}
            </Typography.Paragraph>
            <Typography.Text type="secondary">
              关闭弹窗后无法再次查看该密码，请先复制或妥善记录后再关闭。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <TenantWebhookDrawer
        open={webhookOpen}
        tenantId={currentTenant?.id}
        tenantName={currentTenant?.name}
        onClose={() => setWebhookOpen(false)}
      />
      <TenantOpenApiSubscriptionDrawer
        open={openApiOpen}
        tenant={currentTenant ? { id: currentTenant.id, name: currentTenant.name, code: currentTenant.code } : null}
        onClose={() => setOpenApiOpen(false)}
        onSaved={refreshAll}
      />
    </div>
  );
};

export default TenantList;
