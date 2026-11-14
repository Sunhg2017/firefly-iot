import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { deviceApi, productApi, sharePolicyApi, tenantApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import JsonEditorField, { isValidJson } from '../../components/JsonEditorField';
import { TenantSelect } from '../../components/EntitySelect';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, toIsoDateTime } from '../../utils/datetime';

interface TenantOption {
  id: number;
  code: string;
  name: string;
}

interface PolicyItem {
  id: number;
  ownerTenantId: number;
  consumerTenantId: number;
  name: string;
  scope: string;
  dataPermissions: string;
  maskingRules: string;
  rateLimit: string;
  validity: string;
  status: string;
  auditEnabled: boolean;
  createdBy: number;
  approvedBy: number;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogItem {
  id: number;
  policyId: number;
  consumerTenantId: number;
  action: string;
  queryDetail: string;
  resultCount: number;
  ipAddress: string;
  createdAt: string;
}

interface RemoteOptionItem {
  value: string;
  label: string;
}

interface MaskingRuleValue {
  field?: string;
  strategy?: string;
}

interface SharePolicyFormValues {
  name: string;
  consumerTenantId: number;
  productKeys?: string[];
  deviceNames?: string[];
  permissions?: string[];
  maskingRules?: MaskingRuleValue[];
  qps?: number;
  dailyLimit?: number;
  validity?: [Dayjs | null, Dayjs | null] | null;
  advancedScope?: string;
  advancedDataPermissions?: string;
  advancedMaskingRules?: string;
  advancedRateLimit?: string;
  advancedValidity?: string;
}

const statusLabels: Record<string, string> = {
  PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', REVOKED: '已撤销', EXPIRED: '已过期',
};
const statusColors: Record<string, string> = {
  PENDING: 'processing', APPROVED: 'success', REJECTED: 'error', REVOKED: 'default', EXPIRED: 'warning',
};

const MASKING_STRATEGY_OPTIONS = [
  { value: 'MASK_ALL', label: 'MASK_ALL（全部掩码）' },
  { value: 'MASK_MIDDLE', label: 'MASK_MIDDLE（保留首尾）' },
  { value: 'ROUND_0', label: 'ROUND_0（取整）' },
  { value: 'ROUND_1', label: 'ROUND_1（保留 1 位小数）' },
  { value: 'ROUND_2', label: 'ROUND_2（保留 2 位小数）' },
  { value: 'ROUND_3', label: 'ROUND_3（保留 3 位小数）' },
  { value: 'ROUND_4', label: 'ROUND_4（保留 4 位小数）' },
];

const PERMISSION_OPTIONS = [
  { value: 'properties', label: '属性' },
  { value: 'telemetry', label: '遥测' },
  { value: 'events', label: '事件' },
];

/**
 * 共享策略的 validity 由后端以字符串保存；范围选择器提交的时区偏移串会被后端按本地时间解析，
 * 因此先取统一工具生成的 ISO 时刻，再转成本地时区无偏移字面量。
 */
const toBackendDateTime = (value: Dayjs | null | undefined): string | undefined => {
  const iso = toIsoDateTime(value ? value.toDate() : null);
  return iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm:ss') : undefined;
};

const parseJson = (raw?: string | null): unknown => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const parseScope = (raw?: string | null): { productKeys: string[]; deviceNames: string[] } => {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { productKeys: [], deviceNames: [] };
  }
  const record = parsed as Record<string, unknown>;
  const productKeys = Array.from(new Set([
    ...readStringList(record.productKeys),
    ...readStringList(record.productKey),
  ]));
  const deviceNames = Array.from(new Set([
    ...readStringList(record.deviceNames),
    ...readStringList(record.deviceName),
  ]));
  return { productKeys, deviceNames };
};

/** 与后端 parsePermissionFlag 保持一致：布尔、字符串、数组、对象都可能是权限开关。 */
const isPermissionEnabled = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized !== '' && normalized !== 'FALSE' && normalized !== 'NONE' && normalized !== 'DISABLED';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.enabled === 'boolean') {
      return record.enabled;
    }
    const mode = typeof record.mode === 'string' ? record.mode.trim().toUpperCase() : '';
    if (mode) {
      return mode !== 'NONE' && mode !== 'DISABLED';
    }
    return Array.isArray(record.allowed) && record.allowed.length > 0;
  }
  return false;
};

const parsePermissions = (raw?: string | null): string[] => {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const telemetryHistoryEnabled = isPermissionEnabled(record.telemetryHistory);
  return PERMISSION_OPTIONS
    .map((option) => option.value)
    .filter((key) => (key === 'telemetry'
      ? isPermissionEnabled(record.telemetry) || telemetryHistoryEnabled
      : isPermissionEnabled(record[key])));
};

const extractMaskStrategy = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const strategy = (value as Record<string, unknown>).strategy;
    return typeof strategy === 'string' ? strategy : undefined;
  }
  return undefined;
};

const parseMaskingRules = (raw?: string | null): MaskingRuleValue[] => {
  const parsed = parseJson(raw);
  if (!parsed) {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        field: typeof item.field === 'string' ? item.field : undefined,
        strategy: extractMaskStrategy(item.strategy),
      }))
      .filter((item) => item.field || item.strategy);
  }
  if (typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>)
      .map(([field, value]) => ({ field, strategy: extractMaskStrategy(value) }))
      .filter((item) => item.field && item.strategy);
  }
  return [];
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseRateLimit = (raw?: string | null): { qps?: number; dailyLimit?: number } => {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  return {
    qps: toFiniteNumber(record.qps),
    dailyLimit: toFiniteNumber(record.dailyLimit),
  };
};

const parseValidity = (raw?: string | null): [Dayjs, Dayjs] | undefined => {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const start = typeof record.startTime === 'string' ? dayjs(record.startTime) : null;
  const end = typeof record.endTime === 'string' ? dayjs(record.endTime) : null;
  return start?.isValid() && end?.isValid() ? [start, end] : undefined;
};

/** 远程搜索多选（值为 productKey / deviceName 等业务唯一键）。 */
interface RemoteMultiSelectProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder: string;
  loadOptions: (keyword: string) => Promise<RemoteOptionItem[]>;
}

const RemoteMultiSelect: React.FC<RemoteMultiSelectProps> = ({ value, onChange, placeholder, loadOptions }) => {
  const [options, setOptions] = useState<RemoteOptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const loaderRef = useRef(loadOptions);

  useEffect(() => {
    loaderRef.current = loadOptions;
  }, [loadOptions]);

  const load = useCallback(async (keyword: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const records = await loaderRef.current(keyword);
      if (requestRef.current === requestId) {
        setOptions(records);
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setOptions([]);
        message.error(getErrorMessage(error, '加载候选项失败'));
      }
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load('');
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [load]);

  const handleSearch = (keyword: string) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      void load(keyword);
    }, 300);
  };

  const mergedOptions = useMemo(() => {
    const selected = value ?? [];
    const known = new Set(options.map((option) => option.value));
    const missing = selected.filter((item) => !known.has(item)).map((item) => ({ value: item, label: item }));
    return [...options, ...missing];
  }, [options, value]);

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      filterOption={false}
      value={value}
      onChange={onChange}
      onSearch={handleSearch}
      options={mergedOptions}
      loading={loading}
      placeholder={placeholder}
      notFoundContent={loading ? <Spin size="small" /> : '未找到匹配项，换个关键字试试'}
    />
  );
};

const loadProductOptions = async (keyword: string): Promise<RemoteOptionItem[]> => {
  const res = await productApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
  const records = (res.data.data?.records ?? []) as Array<{ name?: string; productKey?: string }>;
  return records
    .filter((item) => item.productKey)
    .map((item) => ({
      value: String(item.productKey),
      label: item.name ? `${item.name}（${item.productKey}）` : String(item.productKey),
    }));
};

const loadDeviceOptions = async (keyword: string): Promise<RemoteOptionItem[]> => {
  const res = await deviceApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
  const records = (res.data.data?.records ?? []) as Array<{ deviceName?: string; nickname?: string }>;
  return records
    .filter((item) => item.deviceName)
    .map((item) => ({
      value: String(item.deviceName),
      label: item.nickname ? `${item.deviceName}（${item.nickname}）` : String(item.deviceName),
    }));
};

const JsonBlock: React.FC<{ value?: string | null }> = ({ value }) => {
  if (!value) {
    return <>-</>;
  }
  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <pre style={{ margin: 0, fontSize: 12, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {value}
      </pre>
      <CopyText text={value}>
        <span style={{ fontSize: 12 }}>复制</span>
      </CopyText>
    </Space>
  );
};

/**
 * 租户名称仅用于展示。这里按 id 补查租户详情，避免预加载 500 条后，
 * 超出范围的租户在列表/详情中显示为“未知租户”。
 */
const useTenantLabels = (ids: number[]) => {
  const [labels, setLabels] = useState<Record<number, string>>({});
  const requestedRef = useRef<Set<number>>(new Set());
  const idsKey = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).join(',');

  useEffect(() => {
    const missing = (idsKey ? idsKey.split(',').map(Number) : [])
      .filter((id) => !requestedRef.current.has(id));
    if (missing.length === 0) {
      return undefined;
    }
    missing.forEach((id) => requestedRef.current.add(id));
    let active = true;
    void Promise.all(missing.map(async (id) => {
      try {
        const res = await tenantApi.get(id);
        const record = res.data.data as TenantOption | null;
        if (!record?.id) {
          return null;
        }
        return { id, label: `${record.name} (${record.code})` };
      } catch {
        requestedRef.current.delete(id);
        return null;
      }
    })).then((records) => {
      if (!active) {
        return;
      }
      const found = records.filter((item): item is { id: number; label: string } => item !== null);
      if (found.length === 0) {
        return;
      }
      setLabels((current) => {
        const next = { ...current };
        found.forEach((item) => {
          next[item.id] = item.label;
        });
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [idsKey]);

  const getTenantDisplay = useCallback((id: number) => labels[id] || '未知租户', [labels]);
  const getPinnedLabel = useCallback((id?: number | null) => (id ? labels[id] : undefined), [labels]);
  return { getTenantDisplay, getPinnedLabel };
};

// ==================== Owned Tab ====================

const OwnedTab: React.FC = () => {
  const [data, setData] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<PolicyItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<PolicyItem | null>(null);
  const [form] = Form.useForm<SharePolicyFormValues>();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const tenantIds = useMemo(() => {
    const ids = data.flatMap((item) => [item.ownerTenantId, item.consumerTenantId]);
    if (editRecord) {
      ids.push(editRecord.consumerTenantId);
    }
    return ids;
  }, [data, editRecord]);

  const { getTenantDisplay, getPinnedLabel } = useTenantLabels(tenantIds);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sharePolicyApi.listOwned();
      setData(res.data.data || []);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载共享策略失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openEditor = (record: PolicyItem | null) => {
    setEditRecord(record);
    form.resetFields();
    if (record) {
      const scope = parseScope(record.scope);
      const rateLimit = parseRateLimit(record.rateLimit);
      form.setFieldsValue({
        name: record.name,
        consumerTenantId: record.consumerTenantId,
        productKeys: scope.productKeys,
        deviceNames: scope.deviceNames,
        permissions: parsePermissions(record.dataPermissions),
        maskingRules: parseMaskingRules(record.maskingRules),
        qps: rateLimit.qps,
        dailyLimit: rateLimit.dailyLimit,
        validity: parseValidity(record.validity),
        advancedScope: '',
        advancedDataPermissions: '',
        advancedMaskingRules: '',
        advancedRateLimit: '',
        advancedValidity: '',
      });
    } else {
      form.setFieldsValue({
        productKeys: [],
        deviceNames: [],
        permissions: ['properties', 'telemetry'],
        maskingRules: [],
        advancedScope: '',
        advancedDataPermissions: '',
        advancedMaskingRules: '',
        advancedRateLimit: '',
        advancedValidity: '',
      });
    }
    setEditOpen(true);
  };

  const resolveJson = (advanced: string | undefined, generated: string | undefined): string | undefined => (
    advanced && advanced.trim() ? advanced.trim() : generated
  );

  const handleSave = async () => {
    let values: SharePolicyFormValues;
    try {
      values = await form.validateFields();
    } catch {
      // 表单校验失败已在字段下方提示，无需重复弹窗。
      return;
    }

    const hasAdvancedScope = Boolean(values.advancedScope?.trim());
    if (!hasAdvancedScope && !(values.productKeys ?? []).length && !(values.deviceNames ?? []).length) {
      message.error('请至少选择一个共享产品或共享设备，或在高级 JSON 中填写共享范围');
      return;
    }

    const advancedFields: Array<[string, string | undefined]> = [
      ['共享范围', values.advancedScope],
      ['数据权限', values.advancedDataPermissions],
      ['脱敏规则', values.advancedMaskingRules],
      ['频率限制', values.advancedRateLimit],
      ['有效期', values.advancedValidity],
    ];
    for (const [label, raw] of advancedFields) {
      if (raw && raw.trim() && !isValidJson(raw)) {
        message.error(`高级 JSON（${label}）格式错误，请修正后再提交`);
        return;
      }
    }

    const maskingRules: Record<string, string> = {};
    for (const rule of values.maskingRules ?? []) {
      const field = rule.field?.trim();
      if (!field || !rule.strategy) {
        continue;
      }
      if (maskingRules[field]) {
        message.error(`脱敏字段「${field}」重复，请合并后再提交`);
        return;
      }
      maskingRules[field] = rule.strategy;
    }

    const productKeys = values.productKeys ?? [];
    const deviceNames = values.deviceNames ?? [];
    const selectedPermissions = values.permissions ?? [];
    // telemetryHistory 只能通过高级 JSON 配置；结构化提交时保留已有限制，避免编辑后历史回溯范围被放大。
    const originalPermissionRecord = parseJson(editRecord?.dataPermissions);
    const originalTelemetryHistory = originalPermissionRecord
      && typeof originalPermissionRecord === 'object'
      && !Array.isArray(originalPermissionRecord)
      ? (originalPermissionRecord as Record<string, unknown>).telemetryHistory
      : undefined;
    const generatedPermissions: Record<string, unknown> = {
      properties: selectedPermissions.includes('properties'),
      telemetry: selectedPermissions.includes('telemetry'),
      events: selectedPermissions.includes('events'),
    };
    if (originalTelemetryHistory && selectedPermissions.includes('telemetry')) {
      generatedPermissions.telemetryHistory = originalTelemetryHistory;
    }
    const rateLimitValue = (values.qps != null || values.dailyLimit != null)
      ? JSON.stringify({
        ...(values.qps != null ? { qps: values.qps } : {}),
        ...(values.dailyLimit != null ? { dailyLimit: values.dailyLimit } : {}),
      })
      : undefined;
    const validityStart = toBackendDateTime(values.validity?.[0]);
    const validityEnd = toBackendDateTime(values.validity?.[1]);
    const validityValue = validityStart && validityEnd
      ? JSON.stringify({ startTime: validityStart, endTime: validityEnd })
      : undefined;

    const payload = {
      name: values.name.trim(),
      consumerTenantId: values.consumerTenantId,
      scope: resolveJson(values.advancedScope, JSON.stringify({ productKeys, deviceNames })),
      dataPermissions: resolveJson(
        values.advancedDataPermissions,
        JSON.stringify(generatedPermissions),
      ),
      maskingRules: resolveJson(values.advancedMaskingRules, JSON.stringify(maskingRules)),
      // 更新接口只在字段非 null 时覆盖，编辑态用空串显式清除已有限流/有效期配置。
      rateLimit: resolveJson(values.advancedRateLimit, rateLimitValue) ?? (editRecord ? '' : undefined),
      validity: resolveJson(values.advancedValidity, validityValue) ?? (editRecord ? '' : undefined),
      auditEnabled: editRecord?.auditEnabled ?? true,
    };

    setSaving(true);
    try {
      if (editRecord) {
        await sharePolicyApi.update(editRecord.id, payload);
        message.success('共享策略已更新');
      } else {
        await sharePolicyApi.create(payload);
        message.success('共享策略已创建，待审批通过后生效');
      }
      setEditOpen(false);
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editRecord ? '更新共享策略失败' : '创建共享策略失败'));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    key: string,
    action: () => Promise<unknown>,
    successText: string,
    fallback: string,
  ) => {
    setPendingAction(key);
    try {
      await action();
      message.success(successText);
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, fallback));
    } finally {
      setPendingAction(null);
    }
  };

  const columns: ColumnsType<PolicyItem> = [
    {
      title: '策略名称',
      dataIndex: 'name',
      width: 180,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '消费方租户',
      width: 180,
      render: (_: unknown, record: PolicyItem) => getTenantDisplay(record.consumerTenantId),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag>,
    },
    {
      title: '审计',
      dataIndex: 'auditEnabled',
      width: 80,
      render: (value: boolean) => (value ? <Tag color="blue">开</Tag> : <Tag>关</Tag>),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      width: 360,
      fixed: 'right',
      render: (_: unknown, record: PolicyItem) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => { setDetailRecord(record); setDetailOpen(true); }}
          >
            详情
          </Button>
          <Tooltip title={record.status === 'PENDING' ? undefined : '仅待审批策略可修改；已生效策略需先撤销，驳回/撤销后请新建策略'}>
            <span>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                disabled={record.status !== 'PENDING'}
                onClick={() => openEditor(record)}
              >
                编辑
              </Button>
            </span>
          </Tooltip>
          {record.status === 'PENDING' && (
            <>
              <Popconfirm
                title="确认批准该共享策略？"
                description="批准后消费方立即可按策略读取共享范围内的设备数据。"
                onConfirm={() => runAction(`approve-${record.id}`, () => sharePolicyApi.approve(record.id), '共享策略已批准', '批准共享策略失败')}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={pendingAction === `approve-${record.id}`}
                >
                  批准
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认驳回该共享策略？"
                description="驳回后消费方无法访问，策略不可再批准，需要重新新建策略。"
                onConfirm={() => runAction(`reject-${record.id}`, () => sharePolicyApi.reject(record.id), '共享策略已驳回', '驳回共享策略失败')}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  loading={pendingAction === `reject-${record.id}`}
                >
                  驳回
                </Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'APPROVED' && (
            <Popconfirm
              title="确认撤销该共享策略？"
              description="撤销后消费方立即无法读取共享数据，撤销不可恢复，需要继续共享请新建策略。"
              onConfirm={() => runAction(`revoke-${record.id}`, () => sharePolicyApi.revoke(record.id), '共享策略已撤销', '撤销共享策略失败')}
            >
              <Button
                type="link"
                size="small"
                icon={<StopOutlined />}
                loading={pendingAction === `revoke-${record.id}`}
              >
                撤销
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确认删除该共享策略？"
            description={record.status === 'APPROVED' ? '已批准策略不能直接删除，请先撤销。' : '删除后策略配置与审批记录不可恢复。'}
            onConfirm={() => runAction(`delete-${record.id}`, () => sharePolicyApi.delete(record.id), '共享策略已删除', '删除共享策略失败')}
            disabled={record.status === 'APPROVED'}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.status === 'APPROVED'}
              loading={pendingAction === `delete-${record.id}`}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建共享策略</Button>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
      </Space>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="共享策略加载失败"
          description={loadError}
          action={<Button size="small" onClick={() => void fetchData()} loading={loading}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        locale={{
          emptyText: (
            <ListEmpty emptyText="暂无共享策略，点击「新建共享策略」创建" />
          ),
        }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
        }}
      />

      <Drawer
        title={editRecord ? `编辑共享策略 - ${editRecord.name}` : '新建共享策略'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={780}
        destroyOnClose
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {editRecord ? '保存修改' : '创建共享策略'}
            </Button>
          </Space>
        )}
      >
        {editRecord ? (
          <Alert
            type="info"
            showIcon
            message="保存后策略仍为待审批状态，需审批通过后才会对消费方生效。"
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Form form={form} layout="vertical">
          <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
            <Form.Item
              name="name"
              label="策略名称"
              rules={[{ required: true, message: '请输入策略名称' }, { max: 128, message: '名称不能超过 128 个字符' }]}
            >
              <Input placeholder="例如：设备运行数据共享" />
            </Form.Item>
            <Form.Item
              name="consumerTenantId"
              label="消费方租户"
              rules={[{ required: true, message: '请选择消费方租户' }]}
            >
              <TenantSelect
                placeholder="搜索并选择租户（名称或编码）"
                pinnedLabel={editRecord ? getPinnedLabel(editRecord.consumerTenantId) : undefined}
              />
            </Form.Item>
          </Card>

          <Card size="small" title="共享范围" style={{ marginBottom: 16 }}>
            <Form.Item
              name="productKeys"
              label="共享产品"
              extra="选择产品后，该产品下的设备数据会被共享。"
            >
              <RemoteMultiSelect placeholder="搜索产品名称或 productKey" loadOptions={loadProductOptions} />
            </Form.Item>
            <Form.Item
              name="deviceNames"
              label="共享设备"
              extra="仅共享指定设备；与共享产品同时配置时取交集。"
            >
              <RemoteMultiSelect placeholder="搜索设备名称" loadOptions={loadDeviceOptions} />
            </Form.Item>
          </Card>

          <Card size="small" title="数据权限" style={{ marginBottom: 16 }}>
            <Form.Item name="permissions" extra="未勾选的数据类型不会共享给消费方。">
              <Checkbox.Group options={PERMISSION_OPTIONS} />
            </Form.Item>
          </Card>

          <Card size="small" title="脱敏规则" style={{ marginBottom: 16 }}>
            <Form.List name="maskingRules">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                      <Form.Item
                        name={[field.name, 'field']}
                        rules={[{ required: true, message: '请输入字段名' }]}
                        style={{ marginBottom: 8, width: 260 }}
                      >
                        <Input placeholder="字段名，例如 imei" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'strategy']}
                        rules={[{ required: true, message: '请选择脱敏规则' }]}
                        style={{ marginBottom: 8, width: 260 }}
                      >
                        <Select placeholder="脱敏规则" options={MASKING_STRATEGY_OPTIONS} />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除脱敏规则"
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>
                    添加脱敏规则
                  </Button>
                </Space>
              )}
            </Form.List>
          </Card>

          <Card size="small" title="频率限制" style={{ marginBottom: 16 }}>
            <Space size={16} style={{ display: 'flex' }}>
              <Form.Item name="qps" label="每秒查询上限（QPS）" style={{ flex: 1 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="不填表示不限制" />
              </Form.Item>
              <Form.Item name="dailyLimit" label="每日调用上限" style={{ flex: 1 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="不填表示不限制" />
              </Form.Item>
            </Space>
          </Card>

          <Card size="small" title="有效期" style={{ marginBottom: 16 }}>
            <Form.Item name="validity" extra="留空表示长期有效。">
              <DatePicker.RangePicker showTime allowClear style={{ width: '100%' }} />
            </Form.Item>
          </Card>

          <Collapse
            items={[{
              key: 'advanced',
              label: '高级 JSON（填写后覆盖上方对应配置）',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="留空表示使用上方结构化表单生成的配置；填写后该字段以 JSON 为准，提交前会校验格式。"
                  />
                  <Form.Item name="advancedScope" label="共享范围 JSON">
                    <JsonEditorField height={140} path="share-scope.json" hint='示例：{"productKeys":["pk1"],"deviceNames":["device-001"]}' />
                  </Form.Item>
                  <Form.Item name="advancedDataPermissions" label="数据权限 JSON">
                    <JsonEditorField height={120} path="share-permissions.json" hint='示例：{"properties":true,"telemetry":true,"events":false}' />
                  </Form.Item>
                  <Form.Item name="advancedMaskingRules" label="脱敏规则 JSON">
                    <JsonEditorField height={120} path="share-masking.json" hint='示例：{"imei":"MASK_MIDDLE","temperature":"ROUND_1"}' />
                  </Form.Item>
                  <Form.Item name="advancedRateLimit" label="频率限制 JSON">
                    <JsonEditorField height={110} path="share-rate-limit.json" hint='示例：{"qps":10,"dailyLimit":10000}' />
                  </Form.Item>
                  <Form.Item name="advancedValidity" label="有效期 JSON">
                    <JsonEditorField height={110} path="share-validity.json" hint='示例：{"startTime":"2025-01-01T00:00:00","endTime":"2025-12-31T23:59:59"}' />
                  </Form.Item>
                </Space>
              ),
            }]}
          />
        </Form>
      </Drawer>

      <Modal
        title="策略详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={720}
      >
        {detailRecord && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="策略名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColors[detailRecord.status]}>{statusLabels[detailRecord.status] || detailRecord.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="审计">{detailRecord.auditEnabled ? <Tag color="blue">开启</Tag> : <Tag>关闭</Tag>}</Descriptions.Item>
            <Descriptions.Item label="所有方租户">{getTenantDisplay(detailRecord.ownerTenantId)}</Descriptions.Item>
            <Descriptions.Item label="消费方租户">{getTenantDisplay(detailRecord.consumerTenantId)}</Descriptions.Item>
            <Descriptions.Item label="共享范围" span={2}><JsonBlock value={detailRecord.scope} /></Descriptions.Item>
            <Descriptions.Item label="数据权限" span={2}><JsonBlock value={detailRecord.dataPermissions} /></Descriptions.Item>
            <Descriptions.Item label="脱敏规则" span={2}><JsonBlock value={detailRecord.maskingRules} /></Descriptions.Item>
            <Descriptions.Item label="频率限制" span={2}><JsonBlock value={detailRecord.rateLimit} /></Descriptions.Item>
            <Descriptions.Item label="有效期" span={2}><JsonBlock value={detailRecord.validity} /></Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(detailRecord.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(detailRecord.updatedAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

// ==================== Consumed Tab ====================

const ConsumedTab: React.FC = () => {
  const [data, setData] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tenantIds = useMemo(
    () => data.flatMap((item) => [item.ownerTenantId, item.consumerTenantId]),
    [data],
  );
  const { getTenantDisplay } = useTenantLabels(tenantIds);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sharePolicyApi.listConsumed();
      setData(res.data.data || []);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载共享给我的策略失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns: ColumnsType<PolicyItem> = [
    { title: '策略名称', dataIndex: 'name', width: 200, ellipsis: true },
    { title: '所有方租户', width: 180, render: (_: unknown, record: PolicyItem) => getTenantDisplay(record.ownerTenantId) },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag> },
    {
      title: '共享范围',
      dataIndex: 'scope',
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
      </Space>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="共享给我的策略加载失败"
          description={loadError}
          action={<Button size="small" onClick={() => void fetchData()} loading={loading}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 900 }}
        locale={{ emptyText: <ListEmpty emptyText="暂无共享给当前租户的策略" /> }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (count) => `共 ${count} 条` }}
      />
    </div>
  );
};

// ==================== Audit Log Tab ====================

const AuditLogTab: React.FC = () => {
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const tenantIds = useMemo(() => data.map((item) => item.consumerTenantId), [data]);
  const { getTenantDisplay } = useTenantLabels(tenantIds);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sharePolicyApi.auditLogs(params);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载共享审计日志失败'));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns: ColumnsType<AuditLogItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
    { title: '消费方租户', width: 180, render: (_: unknown, record: AuditLogItem) => getTenantDisplay(record.consumerTenantId) },
    { title: '操作', dataIndex: 'action', width: 180, render: (value: string) => value || '-' },
    { title: '结果数', dataIndex: 'resultCount', width: 100, render: (value: number) => value ?? '-' },
    { title: 'IP', dataIndex: 'ipAddress', width: 150, render: (value: string) => (value ? <CopyText text={value} /> : '-') },
    {
      title: '查询详情',
      dataIndex: 'queryDetail',
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
      </Space>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="共享审计日志加载失败"
          description={loadError}
          action={<Button size="small" onClick={() => void fetchData()} loading={loading}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        locale={{ emptyText: <ListEmpty emptyText="暂无共享审计日志" /> }}
        pagination={{
          current: params.pageNum,
          pageSize: params.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
          onChange: (page, size) => setParams({ pageNum: page, pageSize: size }),
        }}
      />
    </div>
  );
};

// ==================== Main Page ====================

const SharePage: React.FC = () => (
  <div>
    <PageHeader title="跨租户共享" />
    <Tabs defaultActiveKey="owned" style={{ marginTop: 16 }} items={[
      { key: 'owned', label: '我的共享策略', children: <OwnedTab /> },
      { key: 'consumed', label: '共享给我的', children: <ConsumedTab /> },
      { key: 'audit', label: '共享审计日志', children: <AuditLogTab /> },
    ]} />
  </div>
);

export default SharePage;
