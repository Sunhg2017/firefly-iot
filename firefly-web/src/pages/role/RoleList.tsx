import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { deviceGroupApi, projectApi, roleApi } from '../../services/api';
import { useRemoteOptions, type RemoteOption } from '../../components/EntitySelect';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

interface RoleDataScopeConfig {
  projectIds?: number[];
  groupIds?: string[];
}

interface RoleRecord {
  id: number;
  code: string;
  name: string;
  description?: string;
  type: 'PRESET' | 'CUSTOM' | string;
  dataScope: 'ALL' | 'PROJECT' | 'GROUP' | 'SELF' | 'CUSTOM' | string;
  dataScopeConfig?: RoleDataScopeConfig;
  systemFlag: boolean;
  status: 'ACTIVE' | 'DISABLED' | string;
  permissions?: string[];
  userCount?: number;
  createdAt?: string;
}

interface PermissionOption {
  code: string;
  label: string;
}

interface PermissionGroup {
  key: string;
  label: string;
  routePath?: string;
  permissions: PermissionOption[];
}

interface ProjectOption {
  id: number;
  code: string;
  name: string;
}

interface DeviceGroupOption {
  id: number;
  name: string;
  parentId?: number | null;
}

interface QueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  type?: string;
}

interface RoleFormValues {
  code?: string;
  name?: string;
  description?: string;
  dataScope?: string;
  dataScopeConfig?: RoleDataScopeConfig;
  permissions?: string[];
}

const roleTypeLabels: Record<string, string> = {
  PRESET: '内置角色',
  CUSTOM: '自定义角色',
};

const dataScopeLabels: Record<string, string> = {
  ALL: '全部数据',
  PROJECT: '项目范围',
  GROUP: '设备分组范围',
  SELF: '仅本人',
  CUSTOM: '自定义范围',
};

const statusLabels: Record<string, string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
};

// 稳定的空数组：避免 useWatch 返回 undefined 时每次渲染都生成新引用，导致下游 useMemo 失效。
const EMPTY_PERMISSION_CODES: string[] = [];

interface RemoteProjectMultiSelectProps {
  value?: number[];
  onChange?: (value: number[]) => void;
  pinnedLabels: Map<number, string>;
  placeholder: string;
}

/** 多选项目：服务端关键字搜索 + 已选名称缓存，保证搜索后已选项目仍显示名称。 */
const RemoteProjectMultiSelect: React.FC<RemoteProjectMultiSelectProps> = ({ value, onChange, pinnedLabels, placeholder }) => {
  const { options, loading, onSearch } = useRemoteOptions<ProjectOption>(
    async (keyword) => {
      try {
        const res = await projectApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
        return (res.data.data?.records ?? []) as ProjectOption[];
      } catch (error) {
        message.error(getErrorMessage(error, '搜索项目失败'));
        throw error;
      }
    },
    (item) => ({ value: item.id, label: `${item.name}${item.code ? ` (${item.code})` : ''}` }),
  );
  const [labelCache, setLabelCache] = useState<Record<number, string>>({});

  useEffect(() => {
    if (options.length === 0) {
      return;
    }
    setLabelCache((previous) => {
      const next = { ...previous };
      options.forEach((item) => {
        next[item.value] = item.label;
      });
      return next;
    });
  }, [options]);

  const mergedOptions = useMemo<RemoteOption[]>(() => {
    const known = new Set(options.map((item) => item.value));
    const missing = (value ?? []).filter((id) => !known.has(id));
    return [
      ...options,
      ...missing.map((id) => ({
        value: id,
        label: labelCache[id] ?? pinnedLabels.get(id) ?? '已选项目',
      })),
    ];
  }, [labelCache, options, pinnedLabels, value]);

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      filterOption={false}
      onSearch={onSearch}
      placeholder={placeholder}
      options={mergedOptions}
      loading={loading}
      value={value}
      onChange={(next) => onChange?.(next)}
      notFoundContent={loading ? '项目搜索中...' : '未找到匹配项目，换个关键字试试'}
    />
  );
};

const RoleList: React.FC = () => {
  const [queryForm] = Form.useForm();
  const [form] = Form.useForm<RoleFormValues>();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailDirty, setDetailDirty] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [items, setItems] = useState<RoleRecord[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<DeviceGroupOption[]>([]);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState<QueryState>({ pageNum: 1, pageSize: 20 });
  const [reloadToken, setReloadToken] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<RoleRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Permission panel filters: users can now search by permission name/code, fold modules
  // and narrow the board down to the permissions already granted.
  const [permissionKeyword, setPermissionKeyword] = useState('');
  const [onlySelectedPermissions, setOnlySelectedPermissions] = useState(false);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[]>([]);

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(drawerOpen && detailDirty);
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

  const listRequestIdRef = useRef(0);

  const fetchRoles = async (nextParams: QueryState) => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await roleApi.list(nextParams as unknown as Record<string, unknown>);
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const page = res.data?.data ?? {};
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载角色列表失败'));
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchPermissionGroups = async () => {
    try {
      const res = await roleApi.permissionGroups();
      const groups = (res.data?.data ?? []) as PermissionGroup[];
      setPermissionGroups(groups);
      setExpandedGroupKeys(groups.map((group) => group.key));
    } catch (error) {
      message.error(getErrorMessage(error, '加载可分配权限失败'));
    }
  };

  const fetchScopeOptions = async () => {
    try {
      const groupRes = await deviceGroupApi.listAll();
      setGroupOptions((groupRes.data?.data ?? []) as DeviceGroupOption[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载数据范围选项失败'));
    }
  };

  const projectRequestRef = useRef<Set<number>>(new Set());

  // 角色列表只返回 projectIds；项目名称按需补查，避免为展示名称预加载全部项目。
  const ensureProjectLabels = useCallback((ids: number[]) => {
    const missing = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)))
      .filter((id) => !projectRequestRef.current.has(id));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((id) => projectRequestRef.current.add(id));
    void Promise.all(missing.map(async (id) => {
      try {
        const res = await projectApi.get(id);
        const record = res.data.data as ProjectOption | null;
        return record?.id ? record : null;
      } catch {
        projectRequestRef.current.delete(id);
        return null;
      }
    })).then((records) => {
      const found = records.filter((item): item is ProjectOption => item !== null);
      if (found.length === 0) {
        return;
      }
      setProjectOptions((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        found.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values());
      });
    });
  }, []);

  useEffect(() => {
    const projectIds = items.flatMap((item) => item.dataScopeConfig?.projectIds ?? []);
    ensureProjectLabels(projectIds);
  }, [ensureProjectLabels, items]);

  useEffect(() => {
    void fetchRoles(params);
    // `reloadToken` lets row actions (save/delete/refresh/tab activation) refetch without
    // duplicating the "filter change -> reset page -> fetch" flow.
  }, [params, reloadToken]);

  useEffect(() => {
    void fetchPermissionGroups();
    void fetchScopeOptions();
  }, []);

  const stats = useMemo(
    () => ({
      system: items.filter((item) => item.systemFlag).length,
      active: items.filter((item) => item.status === 'ACTIVE').length,
    }),
    [items],
  );

  const selectedPermissionCodes = Form.useWatch('permissions', form) ?? EMPTY_PERMISSION_CODES;
  const selectedDataScope = Form.useWatch('dataScope', form);

  const selectedPermissionCount = selectedPermissionCodes.length;

  const selectedPermissionSet = useMemo(
    () => new Set(selectedPermissionCodes),
    [selectedPermissionCodes],
  );

  const allPermissionCodes = useMemo(
    () => permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.code)),
    [permissionGroups],
  );

  const permissionLabelMap = useMemo(
    () => new Map(permissionGroups.flatMap((group) => (
      group.permissions.map((permission) => [permission.code, `${permission.label}（${permission.code}）`] as const)
    ))),
    [permissionGroups],
  );

  const filteredPermissionGroups = useMemo(() => {
    const keyword = permissionKeyword.trim().toLowerCase();
    return permissionGroups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((permission) => {
          if (onlySelectedPermissions && !selectedPermissionSet.has(permission.code)) {
            return false;
          }
          if (!keyword) {
            return true;
          }
          return permission.label.toLowerCase().includes(keyword)
            || permission.code.toLowerCase().includes(keyword);
        }),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [onlySelectedPermissions, permissionGroups, permissionKeyword, selectedPermissionSet]);

  const filteredPermissionCodes = useMemo(
    () => filteredPermissionGroups.flatMap((group) => group.permissions.map((permission) => permission.code)),
    [filteredPermissionGroups],
  );

  const projectLabelMap = useMemo(
    () => new Map(projectOptions.map((item) => [item.id, `${item.name}${item.code ? ` (${item.code})` : ''}`])),
    [projectOptions],
  );

  const groupSelectOptions = useMemo(() => {
    const byId = new Map(groupOptions.map((item) => [item.id, item]));
    const buildLabel = (groupId: number): string => {
      const labels: string[] = [];
      let current = byId.get(groupId);
      let depth = 0;
      while (current && depth < 10) {
        labels.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
        depth += 1;
      }
      return labels.join(' / ');
    };
    return groupOptions.map((item) => ({
      value: String(item.id),
      label: buildLabel(item.id),
    }));
  }, [groupOptions]);

  const groupLabelMap = useMemo(
    () => new Map(groupSelectOptions.map((item) => [item.value, String(item.label)])),
    [groupSelectOptions],
  );

  const summarizeScopeTargets = (config?: RoleDataScopeConfig): string[] => {
    if (!config) {
      return [];
    }
    const projectLabels = (config.projectIds ?? [])
      .map((projectId) => projectLabelMap.get(projectId))
      .filter((item): item is string => Boolean(item))
      .map((label) => `项目: ${label}`);
    const groupLabels = (config.groupIds ?? [])
      .map((groupId) => groupLabelMap.get(groupId))
      .filter((item): item is string => Boolean(item))
      .map((label) => `设备分组: ${label}`);
    return [...projectLabels, ...groupLabels];
  };

  const validateDataScopeConfig = async () => {
    const scope = form.getFieldValue('dataScope') as string | undefined;
    const config = (form.getFieldValue('dataScopeConfig') ?? {}) as RoleDataScopeConfig;
    const projectIds = config.projectIds ?? [];
    const groupIds = config.groupIds ?? [];
    form.setFields([
      { name: ['dataScopeConfig', 'projectIds'], errors: [] },
      { name: ['dataScopeConfig', 'groupIds'], errors: [] },
    ]);

    if (scope === 'PROJECT' && projectIds.length === 0) {
      form.setFields([{ name: ['dataScopeConfig', 'projectIds'], errors: ['请选择至少一个项目'] }]);
      throw new Error('project-scope-required');
    }
    if (scope === 'GROUP' && groupIds.length === 0) {
      form.setFields([{ name: ['dataScopeConfig', 'groupIds'], errors: ['请选择至少一个设备分组'] }]);
      throw new Error('group-scope-required');
    }
    if (scope === 'CUSTOM' && projectIds.length === 0 && groupIds.length === 0) {
      form.setFields([
        { name: ['dataScopeConfig', 'projectIds'], errors: ['请至少选择一个项目或设备分组'] },
        { name: ['dataScopeConfig', 'groupIds'], errors: ['请至少选择一个项目或设备分组'] },
      ]);
      throw new Error('custom-scope-required');
    }
  };

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    setParams((previous) => ({
      ...previous,
      pageNum: 1,
      keyword: values.keyword?.trim() || undefined,
      status: values.status || undefined,
      type: values.type || undefined,
    }));
  };

  const handleReset = () => {
    queryForm.resetFields();
    setParams((previous) => ({
      pageNum: 1,
      pageSize: previous.pageSize,
    }));
  };

  const reloadList = (resetPage = false) => {
    setParams((previous) => (resetPage && previous.pageNum !== 1 ? { ...previous, pageNum: 1 } : previous));
    setReloadToken((current) => current + 1);
  };

  const openCreateDrawer = () => {
    setEditingRole(null);
    setStepIndex(0);
    setDetailDirty(false);
    form.resetFields();
    setPermissionKeyword('');
    setOnlySelectedPermissions(false);
    form.setFieldsValue({
      dataScope: 'PROJECT',
      dataScopeConfig: { projectIds: [], groupIds: [] },
      permissions: [],
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = async (record: RoleRecord) => {
    try {
      const res = await roleApi.get(record.id);
      const detail = (res.data?.data ?? record) as RoleRecord;
      ensureProjectLabels(detail.dataScopeConfig?.projectIds ?? []);
      setEditingRole(detail);
      setStepIndex(0);
      setDetailDirty(false);
      setPermissionKeyword('');
      setOnlySelectedPermissions(false);
      form.resetFields();
      form.setFieldsValue({
        code: detail.code,
        name: detail.name,
        description: detail.description,
        dataScope: detail.dataScope,
        dataScopeConfig: {
          projectIds: detail.dataScopeConfig?.projectIds ?? [],
          groupIds: detail.dataScopeConfig?.groupIds ?? [],
        },
        permissions: detail.permissions ?? [],
      });
      setDrawerOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载角色详情失败'));
    }
  };

  const closeDrawer = () => {
    confirmDiscard(detailDirty, () => {
      setDrawerOpen(false);
      setDetailDirty(false);
    });
  };

  const updatePermissions = (nextPermissions: string[]) => {
    form.setFieldValue('permissions', nextPermissions);
    setDetailDirty(true);
  };

  const toggleGroupPermissions = (groupCodes: string[], checked: boolean) => {
    const next = new Set(selectedPermissionCodes);
    groupCodes.forEach((code) => {
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
    });
    updatePermissions([...next]);
  };

  const replaceGroupSelection = (groupCodes: string[], nextGroupValues: string[]) => {
    const groupCodeSet = new Set(groupCodes);
    const next = selectedPermissionCodes.filter((code) => !groupCodeSet.has(code));
    nextGroupValues.forEach((code) => {
      if (!next.includes(code)) {
        next.push(code);
      }
    });
    updatePermissions(next);
  };

  const handleSelectAllFiltered = () => {
    if (filteredPermissionCodes.length === 0) {
      message.info('当前筛选结果没有可分配的权限');
      return;
    }
    updatePermissions(Array.from(new Set([...selectedPermissionCodes, ...filteredPermissionCodes])));
  };

  const handleClearFiltered = () => {
    if (filteredPermissionCodes.length === 0) {
      return;
    }
    const filteredCodes = new Set(filteredPermissionCodes);
    updatePermissions(selectedPermissionCodes.filter((code) => !filteredCodes.has(code)));
  };

  const resetPermissionFilters = () => {
    setPermissionKeyword('');
    setOnlySelectedPermissions(false);
    setExpandedGroupKeys(permissionGroups.map((group) => group.key));
  };

  const handlePermissionKeywordChange = (value: string) => {
    setPermissionKeyword(value);
    const keyword = value.trim().toLowerCase();
    if (!keyword) {
      return;
    }
    const matchedKeys = permissionGroups
      .filter((group) => group.permissions.some((permission) => (
        permission.label.toLowerCase().includes(keyword) || permission.code.toLowerCase().includes(keyword)
      )))
      .map((group) => group.key);
    setExpandedGroupKeys((previous) => Array.from(new Set([...previous, ...matchedKeys])));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      await roleApi.delete(deleteTarget.id);
      message.success('角色已删除');
      setDeleteTarget(null);
      reloadList(true);
    } catch (error) {
      // 失败时弹窗保持打开，用户可以直接重试或取消；错误原因必须可见。
      message.error(getErrorMessage(error, '删除角色失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDataScopeChange = (scope: string) => {
    const currentConfig = (form.getFieldValue('dataScopeConfig') ?? {}) as RoleDataScopeConfig;
    if (scope === 'ALL' || scope === 'SELF') {
      form.setFieldValue('dataScopeConfig', undefined);
      return;
    }
    form.setFieldValue('dataScopeConfig', {
      projectIds: currentConfig.projectIds ?? [],
      groupIds: currentConfig.groupIds ?? [],
    });
  };

  const handleNextStep = async () => {
    try {
      if (stepIndex === 0) {
        await form.validateFields(['code', 'name', 'dataScope']);
        await validateDataScopeConfig();
        setStepIndex(1);
        return;
      }

      if (stepIndex === 1) {
        const permissions = form.getFieldValue('permissions') as string[] | undefined;
        if (!Array.isArray(permissions) || permissions.length === 0) {
          message.error('请至少选择一项权限');
          return;
        }
        setStepIndex(2);
      }
    } catch (error) {
      // 校验失败时 antd 已在字段上展示错误；这里只兜底非校验异常，避免未处理的 Promise。
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      if (error instanceof Error && error.message.endsWith('-required')) {
        return;
      }
      message.error(getErrorMessage(error, '校验步骤信息失败'));
    }
  };

  const handleSave = async () => {
    try {
      // All step panels stay mounted, so this validates every step and returns the full form
      // store (name/code/dataScope/menuKey-style fields included), not just the visible step.
      const values = await form.validateFields();
      await validateDataScopeConfig();
      const payload = {
        code: values.code?.trim(),
        name: values.name?.trim(),
        description: values.description?.trim() || undefined,
        dataScope: values.dataScope,
        dataScopeConfig: values.dataScope === 'ALL' || values.dataScope === 'SELF'
          ? undefined
          : {
              projectIds: values.dataScopeConfig?.projectIds ?? [],
              groupIds: (values.dataScopeConfig?.groupIds ?? []).map((groupId) => String(groupId)),
            },
        permissions: values.permissions ?? [],
      };

      setSaving(true);
      if (editingRole) {
        await roleApi.update(editingRole.id, payload);
        message.success('角色已更新');
      } else {
        await roleApi.create(payload);
        message.success('角色已创建');
      }
      setDetailDirty(false);
      setDrawerOpen(false);
      form.resetFields();
      reloadList(true);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        // 校验失败的字段可能位于被隐藏的前几步，必须切回对应步骤，否则用户看不到错误原因。
        const fields = (error as { errorFields?: Array<{ name?: Array<string | number> }> }).errorFields ?? [];
        const firstName = fields[0]?.name?.[0];
        setStepIndex(firstName === 'permissions' ? 1 : 0);
        message.error('请先补全必填项后再保存');
        return;
      }
      if (error instanceof Error && error.message.endsWith('-required')) {
        setStepIndex(0);
        message.error('请先完善数据范围后再保存');
        return;
      }
      message.error(getErrorMessage(error, '保存角色失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<RoleRecord> = [
    {
      title: '角色',
      dataIndex: 'name',
      width: 260,
      render: (_value: string, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Tag color={record.systemFlag ? 'gold' : 'blue'}>
              {record.systemFlag ? '系统角色' : roleTypeLabels[record.type] || record.type}
            </Tag>
            <Tag color={record.status === 'ACTIVE' ? 'success' : 'default'}>
              {statusLabels[record.status] || record.status}
            </Tag>
          </Space>
          <CopyText text={record.code} secondary ellipsis />
        </Space>
      ),
    },
    {
      title: '数据范围',
      dataIndex: 'dataScope',
      width: 180,
      render: (_value: string, record) => {
        const details = summarizeScopeTargets(record.dataScopeConfig);
        return (
          <Space direction="vertical" size={4}>
            <span>{dataScopeLabels[record.dataScope] || record.dataScope}</span>
            {details.length > 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {details.slice(0, 2).join('；')}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '权限数',
      dataIndex: 'permissions',
      width: 100,
      render: (value?: string[]) => value?.length ?? 0,
    },
    {
      title: '成员数',
      dataIndex: 'userCount',
      width: 100,
      render: (value?: number) => value ?? 0,
    },
    {
      title: '说明',
      dataIndex: 'description',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      width: 190,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Tooltip title={record.systemFlag ? '系统内置角色，不可编辑' : undefined}>
            <span>
              <Button type="link" size="small" disabled={record.systemFlag} onClick={() => void openEditDrawer(record)}>
                编辑
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={record.systemFlag ? '系统内置角色，不可删除' : undefined}>
            <span>
              <Button
                type="link"
                size="small"
                danger
                disabled={record.systemFlag}
                onClick={() => setDeleteTarget(record)}
              >
                删除
              </Button>
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const stepItems = [
    { title: '基本信息' },
    { title: '权限配置' },
    { title: '确认提交' },
  ];

  const summaryValues = form.getFieldsValue();
  const summaryScopeTargets = summarizeScopeTargets(summaryValues.dataScopeConfig);
  const hasQueryFilters = Boolean(params.keyword || params.status || params.type);
  const stepPanelStyle = (step: number): React.CSSProperties => ({
    display: stepIndex === step ? 'block' : 'none',
  });

  return (
    <div>
      <PageHeader
        title="角色管理"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => reloadList()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              新建角色
            </Button>
          </Space>
        )}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="角色总数" value={total} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="系统角色（当前页）" value={stats.system} prefix={<LockOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="启用角色（当前页）" value={stats.active} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="角色编码 / 角色名称" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="type" label="角色类型">
            <Select
              allowClear
              placeholder="全部类型"
              style={{ width: 160 }}
              options={Object.entries(roleTypeLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 160 }}
              options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<RoleRecord>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: 1220 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasQueryFilters}
                emptyText="暂无角色，请先新建角色"
                filteredText="没有符合当前筛选条件的角色"
                onClearFilters={handleReset}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (pageNum, pageSize) => {
              setParams((previous) => ({ ...previous, pageNum, pageSize }));
            },
          }}
        />
      </Card>

      <Drawer
        destroyOnClose
        title={editingRole ? `编辑角色 - ${editingRole.name}` : '新建角色'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={960}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Space>
              {stepIndex > 0 && (
                <Button onClick={() => setStepIndex((current) => current - 1)}>
                  上一步
                </Button>
              )}
              {stepIndex < stepItems.length - 1 ? (
                <Button type="primary" onClick={() => void handleNextStep()}>
                  下一步
                </Button>
              ) : (
                <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                  保存角色
                </Button>
              )}
            </Space>
          </Space>
        )}
      >
        <Steps current={stepIndex} items={stepItems} style={{ marginBottom: 24 }} />

        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setDetailDirty(true)}
        >
          {/* 三个步骤必须保持挂载（仅用 display 隐藏）：如果卸载字段，即便去掉 preserve={false}，
              最终 validateFields() 也只会返回当前可见步骤的值，导致保存丢失前几步字段。 */}
          <div style={stepPanelStyle(0)}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="code"
                  label="角色编码"
                  rules={[
                    { required: true, message: '请输入角色编码' },
                    { max: 64, message: '角色编码长度不能超过 64 位' },
                    { pattern: /^[A-Za-z0-9:_-]{2,64}$/, message: '角色编码仅支持字母、数字、冒号、中划线和下划线' },
                  ]}
                >
                  <Input placeholder="例如 tenant_operator" disabled={!!editingRole} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="角色名称"
                  rules={[
                    { required: true, message: '请输入角色名称' },
                    { max: 128, message: '角色名称长度不能超过 128 位' },
                  ]}
                >
                  <Input placeholder="例如 租户运维" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="dataScope"
                  label="数据范围"
                  rules={[{ required: true, message: '请选择数据范围' }]}
                >
                  <Select
                    onChange={handleDataScopeChange}
                    options={Object.entries(dataScopeLabels).map(([value, label]) => ({ value, label }))}
                  />
                </Form.Item>
              </Col>
              {(selectedDataScope === 'PROJECT' || selectedDataScope === 'CUSTOM') && (
                <Col span={24}>
                  <Form.Item name={['dataScopeConfig', 'projectIds']} label="项目范围">
                    <RemoteProjectMultiSelect
                      pinnedLabels={projectLabelMap}
                      placeholder={selectedDataScope === 'PROJECT' ? '搜索并选择项目（名称或编码）' : '可选，输入项目名称或编码搜索'}
                    />
                  </Form.Item>
                </Col>
              )}
              {(selectedDataScope === 'GROUP' || selectedDataScope === 'CUSTOM') && (
                <Col span={24}>
                  <Form.Item name={['dataScopeConfig', 'groupIds']} label="设备分组范围">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={selectedDataScope === 'GROUP' ? '请选择允许访问的设备分组' : '可选，不选则仅按项目控制'}
                      options={groupSelectOptions}
                    />
                  </Form.Item>
                </Col>
              )}
              {selectedDataScope === 'CUSTOM' && (
                <Col span={24}>
                  <Alert
                    type="info"
                    showIcon
                    message="自定义范围"
                    description="同时选择项目和设备分组后，角色只可访问命中的业务数据。"
                  />
                </Col>
              )}
              <Col span={24}>
                <Form.Item name="description" label="角色说明">
                  <Input.TextArea rows={4} placeholder="可选，用于说明该角色的职责边界" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <div style={stepPanelStyle(1)}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                size="small"
                title="快速操作"
                extra={(
                  <Space wrap>
                    <Typography.Text type="secondary">
                      已选 {selectedPermissionCodes.length} 项
                    </Typography.Text>
                    <Button size="small" disabled={filteredPermissionCodes.length === 0} onClick={handleSelectAllFiltered}>
                      全选（筛选结果）
                    </Button>
                    <Button size="small" disabled={filteredPermissionCodes.length === 0} onClick={handleClearFiltered}>
                      清空（筛选结果）
                    </Button>
                    <Button size="small" disabled={selectedPermissionCodes.length === 0} onClick={() => updatePermissions([])}>
                      清空全部
                    </Button>
                  </Space>
                )}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap size={12}>
                    <Input
                      allowClear
                      style={{ width: 280 }}
                      value={permissionKeyword}
                      placeholder="按权限名称或编码搜索"
                      onChange={(event) => handlePermissionKeywordChange(event.target.value)}
                    />
                    <Checkbox
                      checked={onlySelectedPermissions}
                      onChange={(event) => setOnlySelectedPermissions(event.target.checked)}
                    >
                      仅看已选
                    </Checkbox>
                    <Button size="small" onClick={() => setExpandedGroupKeys(filteredPermissionGroups.map((group) => group.key))}>
                      展开全部
                    </Button>
                    <Button size="small" onClick={() => setExpandedGroupKeys([])}>
                      收起全部
                    </Button>
                    {(permissionKeyword || onlySelectedPermissions) ? (
                      <Button size="small" type="link" onClick={resetPermissionFilters}>重置权限筛选</Button>
                    ) : null}
                  </Space>
                  <Typography.Text type="secondary">
                    当前筛选命中 {filteredPermissionCodes.length} / 全部 {allPermissionCodes.length} 项权限。
                  </Typography.Text>
                </Space>
              </Card>

              <Form.Item name="permissions" noStyle>
                <div>
                  {filteredPermissionGroups.length === 0 ? (
                    <ListEmpty
                      hasFilters={Boolean(permissionKeyword || onlySelectedPermissions)}
                      emptyText="暂无可分配的权限，请先维护权限资源"
                      filteredText="没有符合当前权限筛选条件的权限"
                      onClearFilters={resetPermissionFilters}
                    />
                  ) : (
                    <Collapse
                      activeKey={expandedGroupKeys}
                      onChange={(keys) => {
                        const nextKeys = Array.isArray(keys) ? keys : [keys];
                        setExpandedGroupKeys(nextKeys.map((key) => String(key)));
                      }}
                      items={filteredPermissionGroups.map((group) => {
                        const groupCodes = group.permissions.map((permission) => permission.code);
                        const selectedInGroup = groupCodes.filter((code) => selectedPermissionSet.has(code)).length;
                        const allChecked = groupCodes.length > 0 ? selectedInGroup === groupCodes.length : false;
                        const partiallyChecked = selectedInGroup > 0 && selectedInGroup < groupCodes.length;

                        return {
                          key: group.key,
                          label: (
                            <Space size={8} wrap>
                              <Typography.Text strong>{group.label}</Typography.Text>
                              <Tag>{`筛选 ${groupCodes.length} 项`}</Tag>
                              <Typography.Text type="secondary">已选 {selectedInGroup}</Typography.Text>
                              {group.routePath ? (
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  {group.routePath}
                                </Typography.Text>
                              ) : null}
                            </Space>
                          ),
                          extra: (
                            <span onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                checked={allChecked}
                                indeterminate={partiallyChecked}
                                onChange={(event) => toggleGroupPermissions(groupCodes, event.target.checked)}
                              >
                                全选本模块
                              </Checkbox>
                            </span>
                          ),
                          children: (
                            <Checkbox.Group
                              style={{ width: '100%' }}
                              value={groupCodes.filter((code) => selectedPermissionSet.has(code))}
                              onChange={(checkedValues) => {
                                replaceGroupSelection(groupCodes, checkedValues.map((value) => String(value)));
                              }}
                            >
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                {group.permissions.map((permission) => (
                                  <Checkbox key={permission.code} value={permission.code}>
                                    {permission.label}
                                    <Typography.Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>
                                      （{permission.code}）
                                    </Typography.Text>
                                  </Checkbox>
                                ))}
                              </Space>
                            </Checkbox.Group>
                          ),
                        };
                      })}
                    />
                  )}
                </div>
              </Form.Item>
            </Space>
          </div>

          <div style={stepPanelStyle(2)}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="角色摘要">
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Typography.Text type="secondary">角色编码</Typography.Text>
                    <div>{summaryValues.code || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">角色名称</Typography.Text>
                    <div>{summaryValues.name || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">数据范围</Typography.Text>
                    <div>{dataScopeLabels[summaryValues.dataScope || ''] || summaryValues.dataScope || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">权限数量</Typography.Text>
                    <div>{selectedPermissionCount}</div>
                  </Col>
                </Row>
                {summaryScopeTargets.length > 0 && (
                  <>
                    <Divider />
                    <Typography.Text type="secondary">范围明细</Typography.Text>
                    <Space size={[8, 8]} wrap style={{ display: 'flex', marginTop: 8 }}>
                      {summaryScopeTargets.map((item) => (
                        <Tag key={item}>{item}</Tag>
                      ))}
                    </Space>
                  </>
                )}
                <Divider />
                <Typography.Text type="secondary">角色说明</Typography.Text>
                <div>{summaryValues.description || '未填写'}</div>
              </Card>

              <Card size="small" title="已选权限">
                {(summaryValues.permissions ?? []).length > 0 ? (
                  <Space size={[8, 8]} wrap>
                    {(summaryValues.permissions ?? []).map((permissionCode: string) => (
                      <Tag key={permissionCode} color="blue">
                        {permissionLabelMap.get(permissionCode) ?? permissionCode}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">尚未选择权限</Typography.Text>
                )}
              </Card>
            </Space>
          </div>
        </Form>
      </Drawer>

      <Modal
        open={Boolean(deleteTarget)}
        title="删除角色"
        okText="删除角色"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={deleteSubmitting}
        maskClosable={!deleteSubmitting}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleteTarget(null);
          }
        }}
        onOk={() => void handleConfirmDelete()}
        destroyOnClose
      >
        {deleteTarget ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              确认删除角色 <Typography.Text strong>{deleteTarget.name}</Typography.Text>（{deleteTarget.code}）？
            </Typography.Text>
            <Typography.Text>删除后不可恢复。</Typography.Text>
            <Typography.Text>
              {typeof deleteTarget.userCount === 'number'
                ? `当前已有 ${deleteTarget.userCount} 个用户绑定该角色，删除后这些用户会立即失去该角色及其权限，需要重新分配角色才能继续访问对应功能。`
                : '已分配给用户的角色关联会一并清除，相关用户将立即失去该角色及其权限。'}
            </Typography.Text>
            <Typography.Text type="secondary">
              角色与权限的绑定关系会一并清除，历史审计记录保留。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default RoleList;
