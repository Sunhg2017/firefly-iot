import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import JsonEditorField, { isValidJson } from '../../components/JsonEditorField';
import ListEmpty from '../../components/ListEmpty';
import { deviceApi, deviceGroupApi, productApi, remoteConfigApi, userApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';

type TargetType = 'PRODUCT' | 'GROUP' | 'DEVICE';
type ConfigStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';

interface RemoteConfigRecord {
  id: number;
  projectId?: number;
  name: string;
  description?: string;
  targetType: TargetType;
  targetId?: number;
  configJson: string;
  version: number;
  status: ConfigStatus;
  createdAt: string;
  updatedAt: string;
}

interface RemoteConfigFormValues {
  name: string;
  description?: string;
  targetType: TargetType;
  targetId?: number;
  configJson: string;
}

interface TargetOption {
  value: number;
  label: string;
}

interface VersionRecord {
  version: number;
  configJson: string;
  createdBy?: number;
  createdAt: string;
}

interface AssignmentRecord {
  id: number;
  configVersion: number;
  deviceId: number;
  deviceName?: string;
  status: string;
  errorMessage?: string;
  updatedAt: string;
}

interface ConfigFilters {
  keyword: string;
  status?: ConfigStatus;
  targetType?: TargetType;
}

const EMPTY_FILTERS: ConfigFilters = { keyword: '' };

const statusMeta: Record<ConfigStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PUBLISHED: { label: '已发布', color: 'success' },
  DISABLED: { label: '已停用', color: 'default' },
};

const targetTypeMeta: Record<TargetType, { label: string; color: string }> = {
  PRODUCT: { label: '产品', color: 'blue' },
  GROUP: { label: '分组', color: 'purple' },
  DEVICE: { label: '设备', color: 'cyan' },
};

const targetTypeOptions = (Object.keys(targetTypeMeta) as TargetType[]).map((value) => ({
  value,
  label: targetTypeMeta[value].label,
}));

const defaultConfigTemplate = JSON.stringify(
  {
    sampleInterval: 30,
    reportEnabled: true,
  },
  null,
  2,
);

const assignmentStatusMeta: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待投递', color: 'default' },
  DELIVERED: { label: '已投递', color: 'processing' },
  ACKED: { label: '已确认', color: 'success' },
  FAILED: { label: '失败', color: 'error' },
};

const mergeOptions = (current: TargetOption[], incoming: TargetOption[]) => {
  const mapped = new Map<number, TargetOption>();
  current.forEach((item) => mapped.set(item.value, item));
  incoming.forEach((item) => mapped.set(item.value, item));
  return Array.from(mapped.values());
};

const RemoteConfigPage: React.FC = () => {
  const [data, setData] = useState<RemoteConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filters, setFilters] = useState<ConfigFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ConfigFilters>(EMPTY_FILTERS);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [rowAction, setRowAction] = useState<string | null>(null);
  const [form] = Form.useForm<RemoteConfigFormValues>();
  const watchedTargetType = Form.useWatch('targetType', form);

  const [productOptions, setProductOptions] = useState<TargetOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<TargetOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<TargetOption[]>([]);
  const [deviceSearching, setDeviceSearching] = useState(false);
  const [productSearching, setProductSearching] = useState(false);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [operatorNames, setOperatorNames] = useState<Record<number, string>>({});
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<RemoteConfigRecord | null>(null);

  useDirtyGuard(drawerMode !== null && drawerDirty);
  const confirmDiscard = useConfirmDiscard();

  const targetLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    productOptions.forEach((item) => map.set(`PRODUCT:${item.value}`, item.label));
    groupOptions.forEach((item) => map.set(`GROUP:${item.value}`, item.label));
    deviceOptions.forEach((item) => map.set(`DEVICE:${item.value}`, item.label));
    return map;
  }, [deviceOptions, groupOptions, productOptions]);

  const targetOptionsFor = useCallback(
    (type?: TargetType): TargetOption[] => {
      if (type === 'GROUP') {
        return groupOptions;
      }
      if (type === 'DEVICE') {
        return deviceOptions;
      }
      return productOptions;
    },
    [deviceOptions, groupOptions, productOptions],
  );

  const loadGroupOptions = useCallback(async () => {
    try {
      const groupRes = await deviceGroupApi.listAll();
      const groups = (groupRes.data.data || []) as Array<{ id: number; name: string }>;
      setGroupOptions(groups.map((item) => ({ value: item.id, label: item.name })));
    } catch (error) {
      setGroupOptions([]);
      message.warning(getErrorMessage(error, '加载分组选项失败'));
    }
  }, []);

  const searchProducts = useCallback(async (keyword?: string) => {
    setProductSearching(true);
    try {
      const res = await productApi.list({ pageNum: 1, pageSize: 20, keyword: keyword?.trim() || undefined });
      const products = (res.data.data?.records || []) as Array<{ id: number; productKey: string; name: string }>;
      const options = products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` }));
      // 合并结果，保证已选目标在重新搜索后仍能回显并通过表单校验。
      setProductOptions((current) => mergeOptions(current, options));
    } catch (error) {
      message.error(getErrorMessage(error, '搜索产品失败'));
    } finally {
      setProductSearching(false);
    }
  }, []);

  const searchDevices = useCallback(async (keyword?: string) => {
    setDeviceSearching(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 50, keyword: keyword?.trim() || undefined });
      const records = (res.data.data?.records || []) as Array<{ id: number; deviceName: string; nickname?: string }>;
      const options = records.map((item) => ({
        value: item.id,
        label: item.nickname ? `${item.nickname} (${item.deviceName})` : item.deviceName,
      }));
      // 合并搜索结果，保证已选目标始终能回显，不会因为再次搜索而变成裸 ID。
      setDeviceOptions((current) => mergeOptions(current, options));
    } catch (error) {
      message.error(getErrorMessage(error, '搜索设备失败'));
    } finally {
      setDeviceSearching(false);
    }
  }, []);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await remoteConfigApi.list({
        pageNum: params.pageNum,
        pageSize: params.pageSize,
        keyword: filters.keyword || undefined,
        status: filters.status,
        targetType: filters.targetType,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      setData([]);
      setTotal(0);
      setLoadError(getErrorMessage(error, '加载远程配置失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, params.pageNum, params.pageSize]);

  useEffect(() => {
    void loadGroupOptions();
    void searchProducts('');
    void searchDevices('');
  }, [loadGroupOptions, searchDevices, searchProducts]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  usePageActivation(() => {
    void loadConfigs();
  });

  const applyFilters = () => {
    setFilters({ ...draftFilters, keyword: draftFilters.keyword.trim() });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const hasFilters = filters.keyword !== '' || filters.status != null || filters.targetType != null;

  const closeDrawerImmediately = () => {
    setDrawerMode(null);
    setEditingId(null);
    setDrawerDirty(false);
    form.resetFields();
  };

  const requestCloseDrawer = () => {
    confirmDiscard(drawerDirty, closeDrawerImmediately);
  };

  const openCreate = () => {
    setDrawerMode('create');
    setEditingId(null);
    setDrawerDirty(false);
    form.resetFields();
    form.setFieldsValue({ targetType: 'PRODUCT', configJson: defaultConfigTemplate });
  };

  const fetchTargetOption = async (type: TargetType, id: number): Promise<TargetOption | null> => {
    try {
      if (type === 'PRODUCT') {
        const res = await productApi.get(id);
        const record = res.data.data as { id?: number; name?: string; productKey?: string } | null;
        if (!record?.name) {
          return null;
        }
        const option = { value: record.id ?? id, label: `${record.name} (${record.productKey ?? '-'})` };
        setProductOptions((current) => mergeOptions(current, [option]));
        return option;
      }
      if (type === 'GROUP') {
        const res = await deviceGroupApi.get(id);
        const record = res.data.data as { id?: number; name?: string } | null;
        if (!record?.name) {
          return null;
        }
        const option = { value: record.id ?? id, label: record.name };
        setGroupOptions((current) => mergeOptions(current, [option]));
        return option;
      }
      const res = await deviceApi.get(id);
      const record = res.data.data as { id?: number; deviceName?: string; nickname?: string } | null;
      if (!record?.deviceName) {
        return null;
      }
      const option = {
        value: record.id ?? id,
        label: record.nickname ? `${record.nickname} (${record.deviceName})` : record.deviceName,
      };
      setDeviceOptions((current) => mergeOptions(current, [option]));
      return option;
    } catch (error) {
      message.warning(getErrorMessage(error, '加载下发目标名称失败'));
      return null;
    }
  };

  const ensureTargetOption = async (type: TargetType, id?: number): Promise<TargetOption | null> => {
    if (!id) {
      return null;
    }
    const existing = targetOptionsFor(type).find((item) => item.value === id);
    if (existing) {
      return existing;
    }
    return fetchTargetOption(type, id);
  };

  // 版本列表只需要的少量 createdBy 名称，按 id 补查即可，避免预加载全部用户导致 500 之外的操作人缺失。
  const loadOperatorNames = async (records: VersionRecord[]) => {
    const ids = Array.from(new Set(
      records
        .map((item) => item.createdBy)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    ));
    if (ids.length === 0) {
      return;
    }
    const entries = await Promise.all(ids.map(async (id) => {
      try {
        const res = await userApi.get(id);
        const record = res.data.data as { username?: string; realName?: string } | null;
        const name = record?.realName?.trim() || record?.username?.trim();
        return name ? [id, name] as const : null;
      } catch {
        // 操作人名称仅用于展示，单条补查失败不阻断版本列表。
        return null;
      }
    }));
    const found = entries.filter((item): item is readonly [number, string] => item !== null);
    if (found.length === 0) {
      return;
    }
    setOperatorNames((current) => {
      const next = { ...current };
      found.forEach(([id, name]) => {
        next[id] = name;
      });
      return next;
    });
  };

  const formatJson = (raw?: string) => {
    if (!raw) {
      return defaultConfigTemplate;
    }
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // 历史配置可能不是合法 JSON，先原样展示，由编辑器与提交校验提示用户修正。
      return raw;
    }
  };

  const openEdit = async (record: RemoteConfigRecord) => {
    setDrawerMode('edit');
    setEditingId(record.id);
    setDrawerDirty(false);
    try {
      const res = await remoteConfigApi.get(record.id);
      const detail = res.data.data as RemoteConfigRecord;
      const targetOption = await ensureTargetOption(detail.targetType, detail.targetId);
      form.resetFields();
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        targetType: detail.targetType,
        targetId: detail.targetId,
        configJson: formatJson(detail.configJson),
      });
      setDrawerDirty(false);
      if (!targetOption) {
        message.warning('原下发目标已不存在或无法加载，请重新选择下发目标');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载配置详情失败'));
      closeDrawerImmediately();
    }
  };

  const targetOptions = targetOptionsFor(watchedTargetType);

  const handleTargetTypeChange = (nextType: TargetType) => {
    // 切换目标类型必须清空旧 targetId，否则产品 ID 会被当成设备 ID 下发。
    form.setFields([{ name: 'targetId', value: undefined, errors: [] }]);
    setDeviceOptions([]);
    if (nextType === 'DEVICE') {
      void searchDevices('');
    } else if (nextType === 'PRODUCT') {
      void searchProducts('');
    }
    setDrawerDirty(true);
  };

  const handleSubmit = (values: RemoteConfigFormValues) => {
    let configJson: string;
    try {
      const parsedConfig: unknown = JSON.parse(values.configJson);
      if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
        message.error('配置内容必须是 JSON 对象');
        return;
      }
      configJson = JSON.stringify(parsedConfig);
    } catch (error) {
      message.error(getErrorMessage(error, '配置内容不是合法 JSON，请修正后再保存'));
      return;
    }

    const target = targetOptionsFor(values.targetType).find((item) => item.value === values.targetId);
    if (!values.targetId || !target) {
      form.setFields([{ name: 'targetId', errors: ['所选下发目标已失效，请重新选择'] }]);
      message.error('所选下发目标已失效，请重新选择');
      return;
    }

    const targetMeta = targetTypeMeta[values.targetType];
    Modal.confirm({
      title: drawerMode === 'edit' ? '确认保存配置修改？' : '确认创建远程配置？',
      content: `目标类型：${targetMeta.label}；下发目标：${target.label}。请确认配置不会下发到错误对象。`,
      okText: '确认保存',
      cancelText: '返回检查',
      onOk: async () => {
        setSubmitting(true);
        try {
          const payload = {
            name: values.name.trim(),
            description: values.description?.trim() || undefined,
            targetType: values.targetType,
            targetId: values.targetId,
            configJson,
          };
          if (drawerMode === 'edit' && editingId) {
            await remoteConfigApi.update(editingId, payload);
            message.success('配置已更新');
          } else {
            await remoteConfigApi.create(payload);
            message.success('配置已创建');
          }
          setDrawerDirty(false);
          closeDrawerImmediately();
          await loadConfigs();
        } catch (error) {
          message.error(getErrorMessage(error, drawerMode === 'edit' ? '更新配置失败' : '创建配置失败'));
          throw error;
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const runRowAction = async (key: string, fallback: string, action: () => Promise<void>) => {
    if (rowAction) {
      return;
    }
    setRowAction(key);
    try {
      await action();
    } catch (error) {
      message.error(getErrorMessage(error, fallback));
    } finally {
      setRowAction(null);
    }
  };

  const handlePublish = (record: RemoteConfigRecord) =>
    runRowAction(`publish:${record.id}`, '发布配置失败', async () => {
      await remoteConfigApi.publish(record.id);
      message.success('配置已发布');
      await loadConfigs();
    });

  const handleDisable = (record: RemoteConfigRecord) =>
    runRowAction(`disable:${record.id}`, '停用配置失败', async () => {
      await remoteConfigApi.disable(record.id);
      message.success('配置已停用');
      await loadConfigs();
    });

  const handleDelete = (record: RemoteConfigRecord) => {
    Modal.confirm({
      title: '确认删除配置',
      content: `删除“${record.name}”后配置及其版本历史将不可恢复；已下发到设备影子期望值的内容不会自动撤回。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await remoteConfigApi.delete(record.id);
          message.success('配置已删除');
          await loadConfigs();
        } catch (error) {
          message.error(getErrorMessage(error, '删除配置失败'));
          throw error;
        }
      },
    });
  };

  const handleDeploy = (record: RemoteConfigRecord) => {
    Modal.confirm({
      title: '确认下发配置',
      content: `将配置 v${record.version} 下发到目标设备，写入影子期望值并投递下行消息。设备离线时会在下次上线后同步。`,
      okText: '确认下发',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await remoteConfigApi.deploy(record.id);
          const result = res.data.data as { requested: number; success: number; failed: number };
          message.success(`下发完成：共 ${result.requested} 台，成功 ${result.success}，失败 ${result.failed}`);
          await loadConfigs();
        } catch (error) {
          message.error(getErrorMessage(error, '下发配置失败'));
          throw error;
        }
      },
    });
  };

  const openVersions = async (record: RemoteConfigRecord) => {
    setActiveConfig(record);
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await remoteConfigApi.versions(record.id);
      const records = (res.data.data || []) as VersionRecord[];
      setVersions(records);
      void loadOperatorNames(records);
    } catch (error) {
      setVersions([]);
      setVersionsError(getErrorMessage(error, '加载配置版本失败'));
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRollback = (record: RemoteConfigRecord, version: number) => {
    Modal.confirm({
      title: '确认回滚',
      content: `将以 v${version} 的内容发布为新版本并保留版本历史；设备会在下次同步时收到该配置。`,
      okText: '确认回滚',
      cancelText: '取消',
      onOk: async () => {
        try {
          await remoteConfigApi.rollback(record.id, version);
          message.success('已回滚并发布新版本');
          await loadConfigs();
          await openVersions(record);
        } catch (error) {
          message.error(getErrorMessage(error, '回滚配置失败'));
          throw error;
        }
      },
    });
  };

  const openAssignments = async (record: RemoteConfigRecord) => {
    setActiveConfig(record);
    setAssignmentsOpen(true);
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const res = await remoteConfigApi.assignments(record.id);
      setAssignments((res.data.data || []) as AssignmentRecord[]);
    } catch (error) {
      setAssignments([]);
      setAssignmentsError(getErrorMessage(error, '加载下发记录失败'));
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const columns: ColumnsType<RemoteConfigRecord> = [
    {
      title: '配置名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (value: string) => <CopyText text={value} ellipsis />,
    },
    {
      title: '目标',
      width: 240,
      render: (_, record) => (
        <Space size={4}>
          <Tag color={targetTypeMeta[record.targetType]?.color}>{targetTypeMeta[record.targetType]?.label}</Tag>
          <CopyText
            text={targetLabelMap.get(`${record.targetType}:${record.targetId}`) || '目标已删除或不可用'}
            ellipsis
          />
        </Space>
      ),
    },
    { title: '版本', dataIndex: 'version', width: 80, render: (value: number) => `v${value ?? 0}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ConfigStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 190,
      render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis />,
    },
    {
      title: '操作',
      width: 340,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button type="link" size="small" onClick={() => void openEdit(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            loading={rowAction === `publish:${record.id}`}
            onClick={() => void handlePublish(record)}
          >
            发布
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RocketOutlined />}
            disabled={record.status !== 'PUBLISHED'}
            onClick={() => handleDeploy(record)}
          >
            下发
          </Button>
          <Button type="link" size="small" onClick={() => void openVersions(record)}>版本</Button>
          <Button type="link" size="small" onClick={() => void openAssignments(record)}>下发记录</Button>
          <Button
            type="link"
            size="small"
            loading={rowAction === `disable:${record.id}`}
            disabled={record.status === 'DISABLED'}
            onClick={() => void handleDisable(record)}
          >
            停用
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="远程配置"
        description="维护配置模板与版本，并按产品、分组或设备下发。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建配置</Button>}
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="配置名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
            style={{ width: 220 }}
          />
          <Select<TargetType>
            placeholder="目标类型"
            allowClear
            value={draftFilters.targetType}
            options={targetTypeOptions}
            onChange={(value) => setDraftFilters((current) => ({ ...current, targetType: value }))}
            style={{ width: 130 }}
          />
          <Select<ConfigStatus>
            placeholder="状态"
            allowClear
            value={draftFilters.status}
            options={[
              { value: 'DRAFT', label: '草稿' },
              { value: 'PUBLISHED', label: '已发布' },
              { value: 'DISABLED', label: '已停用' },
            ]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
            style={{ width: 120 }}
          />
          <Button type="primary" onClick={applyFilters}>查询</Button>
          <Button onClick={resetFilters}>重置</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadConfigs()} loading={loading}>刷新</Button>
        </Space>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="加载远程配置失败"
            description={loadError}
            action={<Button size="small" danger onClick={() => void loadConfigs()}>重试</Button>}
          />
        ) : null}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText="暂无远程配置，点击右上角“新建配置”创建"
                filteredText="没有符合当前筛选条件的远程配置"
                onClearFilters={resetFilters}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (pageNum, pageSize) => setParams({ pageNum, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={drawerMode === 'edit' ? '编辑远程配置' : '新建远程配置'}
        width={620}
        open={drawerMode !== null}
        onClose={requestCloseDrawer}
        destroyOnClose
        maskClosable={false}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={requestCloseDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>保存</Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => setDrawerDirty(true)}
        >
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input maxLength={256} placeholder="例如：采集周期配置" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input maxLength={512} />
          </Form.Item>
          <Form.Item name="targetType" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
            <Select options={targetTypeOptions} onChange={handleTargetTypeChange} />
          </Form.Item>
          <Form.Item
            name="targetId"
            label="下发目标"
            rules={[
              { required: true, message: '请选择下发目标' },
              {
                validator: async (_rule: unknown, value?: number) => {
                  if (!value) {
                    return;
                  }
                  const targetType = form.getFieldValue('targetType') as TargetType | undefined;
                  if (!targetType) {
                    return;
                  }
                  if (!targetOptionsFor(targetType).some((item) => item.value === value)) {
                    throw new Error('所选目标不属于当前目标类型，请重新选择');
                  }
                },
              },
            ]}
          >
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={targetOptions}
              loading={watchedTargetType === 'DEVICE' ? deviceSearching : watchedTargetType === 'PRODUCT' ? productSearching : false}
              onSearch={
                watchedTargetType === 'DEVICE'
                  ? (keyword) => void searchDevices(keyword)
                  : watchedTargetType === 'PRODUCT'
                    ? (keyword) => void searchProducts(keyword)
                    : undefined
              }
              placeholder="搜索并选择产品/分组/设备"
            />
          </Form.Item>
          <Form.Item
            name="configJson"
            label="配置内容"
            rules={[
              { required: true, message: '请输入配置内容' },
              {
                validator: async (_rule: unknown, value?: string) => {
                  if (!value) {
                    return;
                  }
                  if (!isValidJson(value)) {
                    throw new Error('配置内容必须是合法的 JSON');
                  }
                  const parsed = JSON.parse(value) as unknown;
                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('配置内容必须是 JSON 对象');
                  }
                },
              },
            ]}
            extra="仅支持 JSON 对象；保存后会写入设备影子 desired 并作为 PROPERTY_SET 下行。"
          >
            <JsonEditorField
              height={280}
              path={`file:///remote-config/${drawerMode === 'edit' ? editingId ?? 'edit' : 'create'}.json`}
              templates={[{ key: 'default', label: '默认采集配置', value: defaultConfigTemplate }]}
              hint="可插入模板后按需修改"
            />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="配置版本"
        open={versionsOpen}
        footer={null}
        width={820}
        onCancel={() => setVersionsOpen(false)}
      >
        {versionsError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="加载配置版本失败"
            description={versionsError}
            action={activeConfig ? <Button size="small" danger onClick={() => void openVersions(activeConfig)}>重试</Button> : null}
          />
        ) : null}
        <Table
          rowKey="version"
          dataSource={versions}
          loading={versionsLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: <ListEmpty compact emptyText="该配置暂无历史版本" /> }}
          columns={[
            { title: '版本', dataIndex: 'version', width: 80, render: (value: number) => `v${value}` },
            {
              title: '内容',
              width: 340,
              ellipsis: true,
              render: (_, record: VersionRecord) => <CopyText text={record.configJson} ellipsis />,
            },
            {
              title: '操作人',
              width: 130,
              ellipsis: true,
              render: (_, record: VersionRecord) => (
                record.createdBy != null && operatorNames[record.createdBy]
                  ? <CopyText text={operatorNames[record.createdBy]} ellipsis />
                  : '-'
              ),
            },
            {
              title: '发布时间',
              dataIndex: 'createdAt',
              width: 190,
              render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis />,
            },
            {
              title: '操作',
              width: 100,
              render: (_, record: VersionRecord) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => activeConfig && void handleRollback(activeConfig, record.version)}
                >
                  回滚
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="下发记录"
        open={assignmentsOpen}
        footer={null}
        width={820}
        onCancel={() => setAssignmentsOpen(false)}
      >
        {assignmentsError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="加载下发记录失败"
            description={assignmentsError}
            action={activeConfig ? <Button size="small" danger onClick={() => void openAssignments(activeConfig)}>重试</Button> : null}
          />
        ) : null}
        <Table
          rowKey="id"
          dataSource={assignments}
          size="small"
          loading={assignmentsLoading}
          locale={{ emptyText: <ListEmpty compact emptyText="该配置尚未下发" /> }}
          pagination={{ pageSize: 10, showTotal: (count: number) => `共 ${count} 条` }}
          columns={[
            { title: '版本', dataIndex: 'configVersion', width: 80, render: (value: number) => `v${value}` },
            {
              title: '设备',
              dataIndex: 'deviceName',
              ellipsis: true,
              render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (value: string) => (
                <Tag color={assignmentStatusMeta[value]?.color}>{assignmentStatusMeta[value]?.label || value}</Tag>
              ),
            },
            {
              title: '错误',
              dataIndex: 'errorMessage',
              ellipsis: true,
              render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
            },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              width: 190,
              render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis />,
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default RemoteConfigPage;
