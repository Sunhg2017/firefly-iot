import React, { useEffect, useMemo, useState } from 'react';
import { Suspense } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  StopOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
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
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { isRouteGroup } from '../../config/routes';
import { filterWorkspaceRoutes } from '../../config/workspaceRoutes';
import { tenantApi } from '../../services/api';

const { RangePicker } = DatePicker;
const TenantTrendChart = React.lazy(() => import('./TenantTrendChart'));

type TenantPlan = 'FREE' | 'STANDARD' | 'ENTERPRISE';
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
  plan?: TenantPlan;
  status?: TenantStatus;
  isolationLevel?: IsolationLevel;
  createdAt?: string;
}

interface TenantOverview {
  totalTenants?: number;
  activeTenants?: number;
  suspendedTenants?: number;
  freeTenants?: number;
  standardTenants?: number;
  enterpriseTenants?: number;
}

interface TenantQuotaFormValues {
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

interface TenantFormValues {
  code?: string;
  name?: string;
  displayName?: string;
  description?: string;
  logoUrl?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  plan?: TenantPlan;
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
  plan?: TenantPlan;
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
  id: number;
  parentId: number;
  menuKey: string;
  label: string;
  icon?: string | null;
  routePath?: string | null;
  sortOrder?: number;
  visible?: boolean;
  children?: TenantSpaceMenuItem[];
}

interface TenantSpaceRouteLeaf {
  menuKey: string;
  label: string;
  icon?: string | null;
  routePath: string;
  parentMenuKey: string;
  sortOrder: number;
}

interface TenantSpaceRouteGroup {
  menuKey: string;
  label: string;
  icon?: string | null;
  sortOrder: number;
  children: TenantSpaceRouteLeaf[];
}

interface TenantSpaceMenuSubmitPayload {
  parentMenuKey?: string;
  menuKey: string;
  label: string;
  icon?: string;
  routePath?: string;
  sortOrder: number;
  visible: boolean;
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

const planLabels: Record<TenantPlan, string> = {
  FREE: '免费版',
  STANDARD: '标准版',
  ENTERPRISE: '企业版',
};

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

const quotaFields: Array<{ name: keyof TenantQuotaFormValues; label: string }> = [
  { name: 'maxDevices', label: '最大设备数' },
  { name: 'maxMsgPerSec', label: '每秒最大消息数' },
  { name: 'maxRules', label: '最大规则数' },
  { name: 'dataRetentionDays', label: '数据保留天数' },
  { name: 'maxOtaStorageGb', label: 'OTA 存储上限(GB)' },
  { name: 'maxApiCallsDay', label: '每日 API 调用上限' },
  { name: 'maxUsers', label: '最大用户数' },
  { name: 'maxProjects', label: '最大项目数' },
  { name: 'maxVideoChannels', label: '最大视频通道数' },
  { name: 'maxVideoStorageGb', label: '视频存储上限(GB)' },
  { name: 'maxSharePolicies', label: '最大共享策略数' },
];

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

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

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

const guessIconName = (icon: React.ReactNode): string | null => {
  if (!icon || typeof icon !== 'object') return null;
  const element = icon as React.ReactElement;
  if (element.type && typeof element.type === 'object' && 'displayName' in element.type) {
    return (element.type as { displayName?: string }).displayName || null;
  }
  if (element.type && typeof element.type === 'function') {
    return (element.type as { displayName?: string; name?: string }).displayName || element.type.name || null;
  }
  return null;
};

const tenantSpaceRouteGroups: TenantSpaceRouteGroup[] = filterWorkspaceRoutes('tenant')
  .filter((entry) => isRouteGroup(entry))
  .map((entry, groupIndex) => ({
    menuKey: entry.key,
    label: entry.label,
    icon: guessIconName(entry.icon),
    sortOrder: groupIndex,
    children: entry.children.map((child, childIndex) => ({
      menuKey: child.path,
      label: child.label,
      icon: guessIconName(child.icon),
      routePath: child.path,
      parentMenuKey: entry.key,
      sortOrder: childIndex,
    })),
  }));

const tenantSpaceLeafKeySet = new Set(
  tenantSpaceRouteGroups.flatMap((group) => group.children.map((child) => child.routePath)),
);

const allTenantSpaceKeys = Array.from(tenantSpaceLeafKeySet);

const tenantSpaceTreeData: DataNode[] = tenantSpaceRouteGroups.map((group) => ({
  key: `group:${group.menuKey}`,
  title: group.label,
  selectable: false,
  children: group.children.map((child) => ({
    key: child.routePath,
    title: child.label,
    isLeaf: true,
  })),
}));

const collectTenantSpaceCheckedKeys = (items: TenantSpaceMenuItem[]): string[] => {
  const keys: string[] = [];
  const walk = (nodes: TenantSpaceMenuItem[]) => {
    nodes.forEach((node) => {
      if (node.visible === false) {
        return;
      }
      if (node.routePath) {
        keys.push(node.routePath);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children);
      }
    });
  };
  walk(items);
  return Array.from(new Set(keys.filter((key) => tenantSpaceLeafKeySet.has(key))));
};

const buildTenantSpacePayload = (checkedKeys: string[]): TenantSpaceMenuSubmitPayload[] => {
  const selectedRoutePaths = new Set(checkedKeys.filter((key) => tenantSpaceLeafKeySet.has(key)));
  const payload: TenantSpaceMenuSubmitPayload[] = [];

  tenantSpaceRouteGroups.forEach((group) => {
    const selectedChildren = group.children.filter((child) => selectedRoutePaths.has(child.routePath));
    if (selectedChildren.length === 0) {
      return;
    }

    payload.push({
      menuKey: group.menuKey,
      label: group.label,
      icon: group.icon ?? undefined,
      sortOrder: group.sortOrder,
      visible: true,
    });

    selectedChildren.forEach((child) => {
      payload.push({
        parentMenuKey: child.parentMenuKey,
        menuKey: child.menuKey,
        label: child.label,
        icon: child.icon ?? undefined,
        routePath: child.routePath,
        sortOrder: child.sortOrder,
        visible: true,
      });
    });
  });

  return payload;
};

const isSystemOpsTenant = (tenant?: TenantItem | null): boolean => tenant?.code === 'system-ops';

const TenantList: React.FC = () => {
  const [queryForm] = Form.useForm<TenantQueryValues>();
  const [editForm] = Form.useForm<TenantFormValues>();
  const [planForm] = Form.useForm<{ plan: TenantPlan }>();
  const [quotaForm] = Form.useForm<TenantQuotaFormValues>();

  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quotaSubmitting, setQuotaSubmitting] = useState(false);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [spaceLoading, setSpaceLoading] = useState(false);
  const [spaceSubmitting, setSpaceSubmitting] = useState(false);

  const [items, setItems] = useState<TenantItem[]>([]);
  const [overview, setOverview] = useState<TenantOverview>({});
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<TenantQueryValues>({});

  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<TenantItem | null>(null);

  const [usageTenant, setUsageTenant] = useState<TenantItem | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [usageDaily, setUsageDaily] = useState<TenantUsageDaily[]>([]);
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>('deviceCount');
  const [trendRange, setTrendRange] = useState<[Dayjs, Dayjs]>(defaultTrendRange);
  const [checkedSpaceKeys, setCheckedSpaceKeys] = useState<string[]>([]);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await tenantApi.list({ pageNum, pageSize, ...filters });
      const page = (res.data?.data ?? {}) as { records?: TenantItem[]; total?: number };
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await tenantApi.overview();
      setOverview((res.data?.data ?? {}) as TenantOverview);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户概览失败'));
    } finally {
      setOverviewLoading(false);
    }
  };

  const fetchUsageData = async (tenant: TenantItem, range = trendRange) => {
    setUsageLoading(true);
    try {
      const [usageRes, usageDailyRes] = await Promise.all([
        tenantApi.getUsage(tenant.id),
        tenantApi.getUsageDaily(tenant.id, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')),
      ]);
      setUsage((usageRes.data?.data ?? null) as TenantUsage | null);
      setUsageDaily((usageDailyRes.data?.data ?? []) as TenantUsageDaily[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户用量失败'));
      setUsage(null);
      setUsageDaily([]);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    void fetchTenants();
  }, [pageNum, pageSize, filters]);

  useEffect(() => {
    void fetchOverview();
  }, []);

  useEffect(() => {
    if (!usageTenant && items.length > 0) {
      setUsageTenant(items[0]);
      return;
    }
    if (usageTenant) {
      const matched = items.find((item) => item.id === usageTenant.id);
      if (matched && matched !== usageTenant) {
        setUsageTenant(matched);
      }
    }
  }, [items, usageTenant]);

  useEffect(() => {
    if (!usageTenant) return;
    void fetchUsageData(usageTenant, trendRange);
  }, [usageTenant?.id, trendRange]);

  const refreshAll = async () => {
    await Promise.all([
      fetchTenants(),
      fetchOverview(),
      usageTenant ? fetchUsageData(usageTenant) : Promise.resolve(),
    ]);
  };

  const openCreateModal = () => {
    setEditingTenant(null);
    editForm.resetFields();
    editForm.setFieldsValue({ plan: 'FREE', isolationLevel: 'SHARED_RLS' });
    setEditOpen(true);
  };

  const openEditModal = (record: TenantItem) => {
    setEditingTenant(record);
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
          plan: values.plan,
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
      setEditOpen(false);
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '保存租户失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record: TenantItem, nextStatus: TenantStatus) => {
    try {
      await tenantApi.updateStatus(record.id, nextStatus);
      message.success('租户状态已更新');
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '更新租户状态失败'));
    }
  };

  const handleDeactivate = async (record: TenantItem) => {
    try {
      await tenantApi.deactivate(record.id);
      message.success('已发起租户注销');
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '注销租户失败'));
    }
  };

  const openPlanModal = (record: TenantItem) => {
    setCurrentTenant(record);
    planForm.setFieldsValue({ plan: record.plan ?? 'FREE' });
    setPlanOpen(true);
  };

  const handleSavePlan = async () => {
    if (!currentTenant) return;
    try {
      const values = await planForm.validateFields();
      setPlanSubmitting(true);
      await tenantApi.updatePlan(currentTenant.id, values.plan);
      message.success('租户套餐已更新');
      setPlanOpen(false);
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '更新套餐失败'));
    } finally {
      setPlanSubmitting(false);
    }
  };

  const openQuotaModal = async (record: TenantItem) => {
    setCurrentTenant(record);
    try {
      const res = await tenantApi.getQuota(record.id);
      quotaForm.setFieldsValue((res.data?.data ?? {}) as TenantQuotaFormValues);
      setQuotaOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户配额失败'));
    }
  };

  const handleSaveQuota = async () => {
    if (!currentTenant) return;
    try {
      const values = await quotaForm.validateFields();
      setQuotaSubmitting(true);
      await tenantApi.updateQuota(currentTenant.id, values as Record<string, unknown>);
      message.success('租户配额已更新');
      setQuotaOpen(false);
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '更新配额失败'));
    } finally {
      setQuotaSubmitting(false);
    }
  };

  const openSpaceModal = async (record: TenantItem) => {
    setCurrentTenant(record);
    setSpaceLoading(true);
    try {
      const res = await tenantApi.getSpaceMenus(record.id);
      const items = (res.data?.data ?? []) as TenantSpaceMenuItem[];
      setCheckedSpaceKeys(
        items.length > 0 ? collectTenantSpaceCheckedKeys(items) : allTenantSpaceKeys,
      );
      setSpaceOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户空间授权失败'));
    } finally {
      setSpaceLoading(false);
    }
  };

  const handleSaveSpaceMenus = async () => {
    if (!currentTenant) return;

    const payload = buildTenantSpacePayload(checkedSpaceKeys);
    if (payload.length === 0) {
      message.warning('请至少选择一个租户空间功能');
      return;
    }

    try {
      setSpaceSubmitting(true);
      await tenantApi.updateSpaceMenus(currentTenant.id, payload);
      message.success('租户空间授权已更新');
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
    setFilters({ keyword: values.keyword?.trim() || undefined, plan: values.plan, status: values.status });
  };

  const handleReset = () => {
    queryForm.resetFields();
    setPageNum(1);
    setFilters({});
  };

  const columns = useMemo<ColumnsType<TenantItem>>(
    () => [
      { title: '编码', dataIndex: 'code', width: 160 },
      { title: '名称', dataIndex: 'name', width: 180 },
      { title: '展示名', dataIndex: 'displayName', width: 180, render: (value?: string) => value || '-' },
      { title: '套餐', dataIndex: 'plan', width: 110, render: (value?: TenantPlan) => (value ? planLabels[value] : '-') },
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
      { title: '创建时间', dataIndex: 'createdAt', width: 180 },
      {
        title: '操作',
        key: 'action',
        fixed: 'right',
        width: 480,
        render: (_value: unknown, record) => (
          <Space size="small" wrap>
            <Button type="link" size="small" icon={<BarChartOutlined />} onClick={() => setUsageTenant(record)}>用量</Button>
            {!isSystemOpsTenant(record) && (
              <Button type="link" size="small" icon={<AppstoreOutlined />} onClick={() => void openSpaceModal(record)}>空间授权</Button>
            )}
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
            <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => openPlanModal(record)}>套餐</Button>
            <Button type="link" size="small" icon={<SettingOutlined />} onClick={() => void openQuotaModal(record)}>配额</Button>
            {record.status === 'SUSPENDED' ? (
              <Popconfirm title="确认恢复该租户？" onConfirm={() => void handleStatusChange(record, 'ACTIVE')}>
                <Button type="link" size="small">启用</Button>
              </Popconfirm>
            ) : (
              <Popconfirm title="确认暂停该租户？" onConfirm={() => void handleStatusChange(record, 'SUSPENDED')}>
                <Button type="link" size="small" icon={<StopOutlined />}>暂停</Button>
              </Popconfirm>
            )}
            <Popconfirm title="确认注销该租户？" onConfirm={() => void handleDeactivate(record)}>
              <Button type="link" size="small" danger>注销</Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  const trendChartData = useMemo(
    () => usageDaily.map((item) => ({ date: item.date, value: Number(item[trendMetric] ?? 0) })),
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

  return (
    <div>
      <PageHeader
        title="租户管理"
        description="平台管理员可在这里维护租户基本信息、套餐、配额和租户资源使用趋势。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建租户</Button>}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="租户总数" value={overview.totalTenants ?? 0} /></Card></Col>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="启用租户" value={overview.activeTenants ?? 0} /></Card></Col>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="暂停租户" value={overview.suspendedTenants ?? 0} /></Card></Col>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="免费版" value={overview.freeTenants ?? 0} /></Card></Col>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="标准版" value={overview.standardTenants ?? 0} /></Card></Col>
        <Col span={4}><Card loading={overviewLoading}><Statistic title="企业版" value={overview.enterpriseTenants ?? 0} /></Card></Col>
      </Row>

      <Card>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字"><Input allowClear placeholder="租户编码/名称" style={{ width: 220 }} /></Form.Item>
          <Form.Item name="plan" label="套餐"><Select allowClear placeholder="全部套餐" style={{ width: 160 }} options={Object.entries(planLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="status" label="状态"><Select allowClear placeholder="全部状态" style={{ width: 160 }} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item><Space><Button type="primary" htmlType="submit">查询</Button><Button onClick={handleReset}>重置</Button></Space></Form.Item>
        </Form>

        <Table<TenantItem>
          rowKey="id"
          style={{ marginTop: 16 }}
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1880 }}
          pagination={{ current: pageNum, pageSize, total, showSizeChanger: true, onChange: (nextPage, nextPageSize) => { setPageNum(nextPage); setPageSize(nextPageSize); } }}
        />
      </Card>

      <Card
        style={{ marginTop: 16 }}
        title="用量统计 / 趋势图"
        extra={
          <Space wrap>
            <Select
              value={usageTenant?.id}
              placeholder="选择租户"
              style={{ width: 220 }}
              options={items.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))}
              onChange={(tenantId) => setUsageTenant(items.find((item) => item.id === tenantId) ?? null)}
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
          <Empty description="暂无可查看的租户" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={12} wrap>
                <Typography.Text strong>{usageTenant.name}</Typography.Text>
                <Tag>{usageTenant.code}</Tag>
                {usageTenant.plan && <Tag color="blue">{planLabels[usageTenant.plan]}</Tag>}
                {usageTenant.status && <Tag color={statusColors[usageTenant.status]}>{statusLabels[usageTenant.status]}</Tag>}
              </Space>
              <Typography.Text type="secondary">最近更新时间：{usage?.updatedAt || '-'}</Typography.Text>
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
        onClose={() => setEditOpen(false)}
        width={920}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSaveTenant()}>
              {editingTenant ? '保存修改' : '创建租户'}
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            {!editingTenant && (
              <>
                <Col span={12}>
                  <Form.Item name="code" label="租户编码" rules={[{ required: true, message: '请输入租户编码' }, { max: 64, message: '租户编码长度不能超过 64 位' }, { pattern: /^[A-Za-z0-9_-]{2,63}$/, message: '租户编码仅支持大小写字母、数字、中划线和下划线' }]}>
                    <Input placeholder="例如 Acme-Prod_01" />
                  </Form.Item>
                </Col>
                <Col span={12}><Form.Item name="plan" label="套餐" rules={[{ required: true, message: '请选择租户套餐' }]}><Select options={Object.entries(planLabels).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
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
        onClose={() => setSpaceOpen(false)}
        width={860}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setSpaceOpen(false)}>取消</Button>
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
                  <Button size="small" onClick={() => setCheckedSpaceKeys(allTenantSpaceKeys)}>全选</Button>
                  <Button size="small" onClick={() => setCheckedSpaceKeys([])}>清空</Button>
                </Space>
              )}
            >
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                仅支持授权租户业务空间功能，取消勾选的页面将不再出现在租户空间菜单中，并禁止直接访问。
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
                  setCheckedSpaceKeys(nextKeys.filter((key) => tenantSpaceLeafKeySet.has(key)));
                }}
              />
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal destroyOnClose title={`调整套餐${currentTenant ? ` - ${currentTenant.name}` : ''}`} open={planOpen} confirmLoading={planSubmitting} onOk={() => void handleSavePlan()} onCancel={() => setPlanOpen(false)}>
        <Form form={planForm} layout="vertical">
          <Form.Item name="plan" label="套餐" rules={[{ required: true, message: '请选择套餐' }]}>
            <Select options={Object.entries(planLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        destroyOnClose
        title={`调整配额${currentTenant ? ` - ${currentTenant.name}` : ''}`}
        open={quotaOpen}
        onClose={() => setQuotaOpen(false)}
        width={860}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setQuotaOpen(false)}>取消</Button>
            <Button type="primary" loading={quotaSubmitting} onClick={() => void handleSaveQuota()}>
              保存配额
            </Button>
          </Space>
        }
      >
        <Form form={quotaForm} layout="vertical">
          <Row gutter={16}>
            {quotaFields.map((field) => (
              <Col span={12} key={field.name}>
                <Form.Item
                  name={field.name}
                  label={field.label}
                  rules={[
                    {
                      validator: async (_rule, value: number | undefined) => {
                        if (value === undefined || value === null) return;
                        if (!Number.isInteger(value) || value < -1) throw new Error('请输入大于等于 -1 的整数');
                      },
                    },
                  ]}
                >
                  <InputNumber style={{ width: '100%' }} precision={0} min={-1} placeholder="-1 表示不限" />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Form>
      </Drawer>
    </div>
  );
};

export default TenantList;
