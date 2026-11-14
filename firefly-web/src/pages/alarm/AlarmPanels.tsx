import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { ColumnsType } from 'antd/es/table';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  FireOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  alarmRecipientGroupApi,
  alarmRecordApi,
  alarmRuleApi,
  deviceApi,
  notificationChannelApi,
  productApi,
  projectApi,
  userApi,
} from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
import { ALARM_LEVEL_LABELS, ALARM_STATUS_LABELS, ALARM_TEXT } from './alarmText';
import AlarmRuleForm, {
  type AlarmMetricOption,
  type AlarmNotificationMethodOption,
  type AlarmRecipientGroupOption,
  type AlarmRecipientUserOption,
  type AlarmRuleFormStep,
  type AlarmScopeOption,
} from './AlarmRuleForm';
import {
  type AlarmConditionItemFormValues,
  type AlarmRuleGroupFormValues,
  DEFAULT_ALARM_CONDITION_VALUES,
  buildAlarmConditionExpr,
  describeAlarmConditionExpr,
  deriveAlarmRuleLevel,
  getAlarmConditionTypeColor,
  getAlarmConditionTypeLabel,
  getAlarmConditionLevels,
  getAlarmConditionTypes,
  parseAlarmConditionExpr,
} from './alarmCondition';
import {
  buildAlarmNotifyConfig,
  describeAlarmNotifyConfig,
  getAlarmNotificationMethodLabel,
  parseAlarmNotifyConfig,
} from './alarmNotify';

const { TextArea } = Input;

interface AlarmRuleRecord {
  id: number;
  name: string;
  description?: string;
  projectId?: number;
  productId?: number;
  deviceId?: number;
  level: string;
  conditionExpr: string;
  notifyConfig?: string;
  enabled: boolean;
  createdAt: string;
}

interface ProjectRecord {
  id: number;
  code?: string;
  name?: string;
}

interface ProductRecord {
  id: number;
  projectId?: number;
  name?: string;
  productKey?: string;
}

interface DeviceRecord {
  id: number;
  projectId?: number;
  productId?: number;
  deviceName?: string;
  nickname?: string;
}

interface AlarmRecordItem {
  id: number;
  alarmRuleId?: number;
  productId?: number;
  deviceId?: number;
  level: string;
  status: string;
  title: string;
  content?: string;
  triggerValue?: string;
  confirmedBy?: number;
  confirmedAt?: string;
  processedBy?: number;
  processedAt?: string;
  processRemark?: string;
  createdAt: string;
}

interface NotificationTypeRecord {
  type: string;
  label: string;
  channelCount?: number;
}

interface RecipientGroupRecord {
  code: string;
  name: string;
  memberCount?: number;
}

interface RecipientUserRecord {
  username: string;
  realName?: string;
  phone?: string;
  email?: string;
}

interface UserDetailRecord {
  username?: string;
  realName?: string;
}

interface AlarmDetailExtras {
  ruleName?: string;
  productName?: string;
  deviceName?: string;
  confirmedByName?: string;
  processedByName?: string;
}

type AlarmStatusKey = 'TRIGGERED' | 'CONFIRMED' | 'PROCESSED' | 'CLOSED';
type RowAction = 'confirm' | 'close';

const levelColors: Record<string, string> = {
  CRITICAL: 'red',
  WARNING: 'orange',
  INFO: 'blue',
};

const statusColors: Record<string, string> = {
  TRIGGERED: 'error',
  CONFIRMED: 'warning',
  PROCESSED: 'processing',
  CLOSED: 'default',
};

const DEFAULT_RULE_FORM_VALUES = {
  ...DEFAULT_ALARM_CONDITION_VALUES,
  notifyChannels: [],
  recipientGroupCodes: [],
  recipientUsernames: [],
  enabled: true,
};

interface AlarmRuleFormValues extends Record<string, unknown> {
  name?: string;
  projectId?: number;
  productId?: number;
  deviceId?: number;
  notifyChannels?: string[];
  recipientGroupCodes?: string[];
  recipientUsernames?: string[];
  enabled?: boolean;
  ruleGroups?: AlarmRuleGroupFormValues[];
}

interface AlarmRuleDrawerStepConfig {
  key: AlarmRuleFormStep;
  title: string;
  description: string;
}

const ALARM_RULE_DRAWER_STEPS = (showEnabled: boolean): AlarmRuleDrawerStepConfig[] => [
  { key: 'basic', title: ALARM_TEXT.basicCardTitle, description: '填写规则名称和说明' },
  { key: 'scope', title: ALARM_TEXT.scopeCardTitle, description: '选择项目、产品、设备' },
  { key: 'groups', title: ALARM_TEXT.ruleGroupList, description: '配置级别、触发语义和条件' },
  { key: 'notify', title: ALARM_TEXT.notifyCardTitle, description: '选择通知方式与接收对象' },
  {
    key: 'preview',
    title: showEnabled ? `${ALARM_TEXT.preview} / ${ALARM_TEXT.status}` : ALARM_TEXT.preview,
    description: showEnabled ? '核对内容后提交' : '核对规则内容',
  },
];

const getConditionValidationPaths = (
  condition: AlarmConditionItemFormValues | undefined,
  groupIndex: number,
  conditionIndex: number,
) => {
  const basePath = ['ruleGroups', groupIndex, 'conditions', conditionIndex] as const;
  const conditionType = condition?.conditionType || 'THRESHOLD';
  const paths: Array<string | number | Array<string | number>> = [[...basePath, 'conditionType']];

  if (conditionType === 'CUSTOM') {
    paths.push([...basePath, 'customExpr']);
    return paths;
  }

  paths.push([...basePath, 'metricKey']);

  switch (conditionType) {
    case 'THRESHOLD':
      paths.push([...basePath, 'operator'], [...basePath, 'threshold']);
      break;
    case 'COMPARE':
      paths.push(
        [...basePath, 'aggregateType'],
        [...basePath, 'compareTarget'],
        [...basePath, 'threshold'],
        [...basePath, 'windowSize'],
        [...basePath, 'windowUnit'],
        [...basePath, 'changeMode'],
        [...basePath, 'changeDirection'],
      );
      break;
    case 'CONTINUOUS':
      paths.push([...basePath, 'operator'], [...basePath, 'threshold'], [...basePath, 'consecutiveCount']);
      break;
    case 'ACCUMULATE':
      paths.push(
        [...basePath, 'aggregateType'],
        [...basePath, 'operator'],
        [...basePath, 'threshold'],
        [...basePath, 'windowSize'],
        [...basePath, 'windowUnit'],
      );
      break;
    default:
      break;
  }

  return paths;
};

// Validate only the current rule-group module when moving between drawer steps.
const getRuleGroupValidationPaths = (values: AlarmRuleFormValues) => {
  const ruleGroups = Array.isArray(values.ruleGroups) ? values.ruleGroups : [];
  const paths: Array<string | number | Array<string | number>> = [];

  ruleGroups.forEach((group, groupIndex) => {
    paths.push(['ruleGroups', groupIndex, 'level'], ['ruleGroups', groupIndex, 'triggerMode']);

    if ((group?.triggerMode || 'ALL') === 'AT_LEAST') {
      paths.push(['ruleGroups', groupIndex, 'matchCount']);
    }

    const conditions = Array.isArray(group?.conditions) ? group.conditions : [];
    conditions.forEach((condition, conditionIndex) => {
      paths.push(...getConditionValidationPaths(condition, groupIndex, conditionIndex));
    });
  });

  return paths;
};

// Keep notification optional as a whole, but require recipients once channels are selected.
const validateNotifyRecipients = (form: FormInstance<AlarmRuleFormValues>) => {
  const values = form.getFieldsValue(true) as AlarmRuleFormValues;
  const notifyChannels = Array.isArray(values.notifyChannels) ? values.notifyChannels : [];
  const recipientGroupCodes = Array.isArray(values.recipientGroupCodes) ? values.recipientGroupCodes : [];
  const recipientUsernames = Array.isArray(values.recipientUsernames) ? values.recipientUsernames : [];
  const hasRecipients = recipientGroupCodes.length > 0 || recipientUsernames.length > 0;

  if (notifyChannels.length > 0 && !hasRecipients) {
    const error = [ALARM_TEXT.recipientRequired];
    form.setFields([
      { name: ['recipientGroupCodes'], errors: error },
      { name: ['recipientUsernames'], errors: error },
      { name: ['notifyChannels'], errors: [] },
    ]);
    return false;
  }

  if (notifyChannels.length === 0 && hasRecipients) {
    form.setFields([
      { name: ['notifyChannels'], errors: [ALARM_TEXT.notificationMethodRequired] },
      { name: ['recipientGroupCodes'], errors: [] },
      { name: ['recipientUsernames'], errors: [] },
    ]);
    return false;
  }

  form.setFields([
    { name: ['notifyChannels'], errors: [] },
    { name: ['recipientGroupCodes'], errors: [] },
    { name: ['recipientUsernames'], errors: [] },
  ]);
  return true;
};

const validateAlarmRuleStep = async (
  form: FormInstance<AlarmRuleFormValues>,
  stepKey: AlarmRuleFormStep,
) => {
  const values = form.getFieldsValue(true) as AlarmRuleFormValues;

  if (stepKey === 'basic') {
    await form.validateFields([['name']]);
    return;
  }

  if (stepKey === 'groups') {
    const paths = getRuleGroupValidationPaths(values);
    if (paths.length > 0) {
      await form.validateFields(paths);
    }
    return;
  }

  if (stepKey === 'notify' && !validateNotifyRecipients(form)) {
    throw new Error(ALARM_TEXT.recipientRequired);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildProjectOption = (item: ProjectRecord): AlarmScopeOption => ({
  value: item.id,
  label: item.code ? `${item.code} / ${item.name || item.code}` : item.name || `${ALARM_TEXT.project} ${item.id}`,
});

const buildProductOption = (item: ProductRecord): AlarmScopeOption => ({
  value: item.id,
  label:
    item.productKey ? `${item.name || item.productKey} (${item.productKey})` : item.name || `${ALARM_TEXT.product} ${item.id}`,
  projectId: item.projectId,
});

const buildDeviceOption = (item: DeviceRecord): AlarmScopeOption => ({
  value: item.id,
  label:
    item.nickname ? `${item.nickname} (${item.deviceName || item.id})` : item.deviceName || `${ALARM_TEXT.device} ${item.id}`,
  projectId: item.projectId,
  productId: item.productId,
});

const mergeScopeOptions = (current: AlarmScopeOption[], incoming: AlarmScopeOption[]): AlarmScopeOption[] => {
  const mapped = new Map(current.map((item) => [item.value, item]));
  incoming.forEach((item) => mapped.set(item.value, item));
  return Array.from(mapped.values());
};

const parseThingModelMetricOptions = (rawText: unknown): AlarmMetricOption[] => {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawText) as { properties?: unknown[] };
    const properties = Array.isArray(parsed.properties) ? parsed.properties : [];
    return properties
      .map((item) => {
        if (!isRecord(item) || typeof item.identifier !== 'string' || !item.identifier.trim()) {
          return null;
        }
        const identifier = item.identifier.trim();
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        return {
          value: identifier,
          label: name ? `${name} (${identifier})` : identifier,
        };
      })
      .filter((item): item is AlarmMetricOption => Boolean(item));
  } catch {
    return [];
  }
};

const readPageTotal = (res: { data?: { data?: { total?: number } } }): number => res.data?.data?.total ?? 0;

// Detail drawers resolve display names on demand; one missing lookup must not hide the record.
const resolveOptional = async <T,>(loader: () => Promise<T | undefined>): Promise<T | undefined> => {
  try {
    return await loader();
  } catch {
    return undefined;
  }
};

const MiniStat: React.FC<{
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = ({ title, value, icon, color, bg }) => (
  <Card
    bodyStyle={{ padding: '14px 16px' }}
    style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
      </div>
    </div>
  </Card>
);

export const AlarmRulesPanel: React.FC = () => {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [data, setData] = useState<AlarmRuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [globalStats, setGlobalStats] = useState<{ total: number; enabled: number; disabled: number } | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createStepIndex, setCreateStepIndex] = useState(0);
  const [createMaxStepIndex, setCreateMaxStepIndex] = useState(0);
  const [editStepIndex, setEditStepIndex] = useState(0);
  const [editMaxStepIndex, setEditMaxStepIndex] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createForm] = Form.useForm<AlarmRuleFormValues>();
  const [editForm] = Form.useForm<AlarmRuleFormValues>();
  const [filterLevel, setFilterLevel] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [projectOptions, setProjectOptions] = useState<AlarmScopeOption[]>([]);
  const [productOptions, setProductOptions] = useState<AlarmScopeOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<AlarmScopeOption[]>([]);
  const [notificationMethodOptions, setNotificationMethodOptions] = useState<AlarmNotificationMethodOption[]>([]);
  const [recipientGroupOptions, setRecipientGroupOptions] = useState<AlarmRecipientGroupOption[]>([]);
  const [recipientUserOptions, setRecipientUserOptions] = useState<AlarmRecipientUserOption[]>([]);
  const [metricOptionsMap, setMetricOptionsMap] = useState<Record<number, AlarmMetricOption[]>>({});
  const [metricLoadingMap, setMetricLoadingMap] = useState<Record<number, boolean>>({});
  const [metricErrorMap, setMetricErrorMap] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [createTouched, setCreateTouched] = useState(false);
  const [editTouched, setEditTouched] = useState(false);
  const submittingRef = useRef(false);
  const listRequestIdRef = useRef(0);
  const confirmDiscard = useConfirmDiscard();

  const canCreate = hasPermission('alarm:create');
  const canUpdate = hasPermission('alarm:update');
  const canDelete = hasPermission('alarm:delete');
  const createProductId = Form.useWatch('productId', createForm) as number | undefined;
  const editProductId = Form.useWatch('productId', editForm) as number | undefined;
  const hasFilters = Boolean(keyword || filterLevel);

  useDirtyGuard((createOpen && createTouched) || (editOpen && editTouched));

  const projectLabelMap = useMemo(
    () => Object.fromEntries(projectOptions.map((item) => [String(item.value), item.label])),
    [projectOptions],
  );
  const productLabelMap = useMemo(
    () => Object.fromEntries(productOptions.map((item) => [String(item.value), item.label])),
    [productOptions],
  );
  const deviceLabelMap = useMemo(
    () => Object.fromEntries(deviceOptions.map((item) => [String(item.value), item.label])),
    [deviceOptions],
  );
  const recipientGroupLabelMap = useMemo(
    () => Object.fromEntries(recipientGroupOptions.map((item) => [item.value, item.label])),
    [recipientGroupOptions],
  );
  const recipientUserLabelMap = useMemo(
    () => Object.fromEntries(recipientUserOptions.map((item) => [item.value, item.label])),
    [recipientUserOptions],
  );
  const createDrawerSteps = useMemo(() => ALARM_RULE_DRAWER_STEPS(false), []);
  const editDrawerSteps = useMemo(() => ALARM_RULE_DRAWER_STEPS(true), []);

  const resetCreateDrawerState = () => {
    setCreateStepIndex(0);
    setCreateMaxStepIndex(0);
  };

  const resetEditDrawerState = () => {
    setEditStepIndex(0);
    setEditMaxStepIndex(0);
  };

  const closeCreateDrawer = () => {
    setCreateOpen(false);
    setCreateTouched(false);
    resetCreateDrawerState();
    createForm.resetFields();
  };

  const closeEditDrawer = () => {
    setEditOpen(false);
    setEditTouched(false);
    setEditingId(null);
    resetEditDrawerState();
    editForm.resetFields();
  };

  const requestCloseCreateDrawer = () => {
    if (submittingRef.current) {
      return;
    }
    confirmDiscard(createOpen && createForm.isFieldsTouched(), closeCreateDrawer);
  };

  const requestCloseEditDrawer = () => {
    if (submittingRef.current) {
      return;
    }
    confirmDiscard(editOpen && editForm.isFieldsTouched(), closeEditDrawer);
  };

  const handleStepNext = async (
    form: FormInstance<AlarmRuleFormValues>,
    steps: AlarmRuleDrawerStepConfig[],
    currentStepIndex: number,
    setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>,
    setMaxStepIndex: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    const currentStep = steps[currentStepIndex];
    await validateAlarmRuleStep(form, currentStep.key);
    const nextStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);
    setCurrentStepIndex(nextStepIndex);
    setMaxStepIndex((current) => Math.max(current, nextStepIndex));
  };

  const handleVisitedStepChange = (
    targetStepIndex: number,
    maxStepIndex: number,
    setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    if (targetStepIndex <= maxStepIndex) {
      setCurrentStepIndex(targetStepIndex);
      return;
    }

    message.warning('请先按步骤完成当前配置，再进入后续模块。');
  };

  const scopeRequestRef = useRef({
    project: new Set<number>(),
    product: new Set<number>(),
    device: new Set<number>(),
  });

  // 规则列表只返回 projectId/productId/deviceId；范围名称按需补查，避免预加载 500 条后出现盲区。
  const ensureScopeLabels = useCallback((records: AlarmRuleRecord[]) => {
    const idsOf = (values: Array<number | undefined>) => Array.from(new Set(
      values.filter((id): id is number => typeof id === 'number' && id > 0),
    ));

    const missingProjects = idsOf(records.map((item) => item.projectId))
      .filter((id) => !scopeRequestRef.current.project.has(id));
    if (missingProjects.length > 0) {
      missingProjects.forEach((id) => scopeRequestRef.current.project.add(id));
      void Promise.all(missingProjects.map(async (id) => {
        try {
          const res = await projectApi.get(id);
          const record = res.data.data as ProjectRecord | null;
          return record?.id ? buildProjectOption(record) : null;
        } catch {
          scopeRequestRef.current.project.delete(id);
          return null;
        }
      })).then((options) => {
        const found = options.filter((item): item is AlarmScopeOption => item !== null);
        if (found.length > 0) {
          setProjectOptions((current) => mergeScopeOptions(current, found));
        }
      });
    }

    const missingProducts = idsOf(records.map((item) => item.productId))
      .filter((id) => !scopeRequestRef.current.product.has(id));
    if (missingProducts.length > 0) {
      missingProducts.forEach((id) => scopeRequestRef.current.product.add(id));
      void Promise.all(missingProducts.map(async (id) => {
        try {
          const res = await productApi.get(id);
          const record = res.data.data as ProductRecord | null;
          return record?.id ? buildProductOption(record) : null;
        } catch {
          scopeRequestRef.current.product.delete(id);
          return null;
        }
      })).then((options) => {
        const found = options.filter((item): item is AlarmScopeOption => item !== null);
        if (found.length > 0) {
          setProductOptions((current) => mergeScopeOptions(current, found));
        }
      });
    }

    const missingDevices = idsOf(records.map((item) => item.deviceId))
      .filter((id) => !scopeRequestRef.current.device.has(id));
    if (missingDevices.length > 0) {
      missingDevices.forEach((id) => scopeRequestRef.current.device.add(id));
      void Promise.all(missingDevices.map(async (id) => {
        try {
          const res = await deviceApi.get(id);
          const record = res.data.data as DeviceRecord | null;
          return record?.id ? buildDeviceOption(record) : null;
        } catch {
          scopeRequestRef.current.device.delete(id);
          return null;
        }
      })).then((options) => {
        const found = options.filter((item): item is AlarmScopeOption => item !== null);
        if (found.length > 0) {
          setDeviceOptions((current) => mergeScopeOptions(current, found));
        }
      });
    }
  }, []);

  const loadNotifyOptions = async () => {
    try {
      const [channelRes, groupRes, userRes] = await Promise.all([
        notificationChannelApi.listAvailableTypes(),
        alarmRecipientGroupApi.listOptions(),
        userApi.options(),
      ]);

      const methodRecords = (channelRes.data.data || []) as NotificationTypeRecord[];
      const groupRecords = (groupRes.data.data || []) as RecipientGroupRecord[];
      const userRecords = (userRes.data.data || []) as RecipientUserRecord[];

      setNotificationMethodOptions(
        methodRecords.map((item) => ({
          value: item.type as AlarmNotificationMethodOption['value'],
          label: item.label || getAlarmNotificationMethodLabel(item.type),
          channelCount: item.channelCount,
        })),
      );
      setRecipientGroupOptions(
        groupRecords.map((item) => ({
          value: item.code,
          label: item.name,
          memberCount: item.memberCount,
        })),
      );
      setRecipientUserOptions(
        userRecords.map((item) => ({
          value: item.username,
          label: item.realName ? `${item.realName} (@${item.username})` : item.username,
        })),
      );
    } catch (error) {
      message.error(getErrorMessage(error, ALARM_TEXT.loadNotifyOptionsError));
    }
  };

  const metricRequestRef = useRef<Set<number>>(new Set());

  const ensureMetricOptions = async (productId?: number, force = false) => {
    if (!productId || metricRequestRef.current.has(productId)) {
      return;
    }
    if (!force && metricOptionsMap[productId] !== undefined) {
      return;
    }

    metricRequestRef.current.add(productId);
    setMetricLoadingMap((current) => ({ ...current, [productId]: true }));
    try {
      const res = await productApi.getThingModel(productId);
      const nextOptions = parseThingModelMetricOptions(res.data.data);
      setMetricOptionsMap((current) => ({ ...current, [productId]: nextOptions }));
      setMetricErrorMap((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error, ALARM_TEXT.loadThingModelError);
      message.error(errorMessage);
      setMetricOptionsMap((current) => ({ ...current, [productId]: [] }));
      setMetricErrorMap((current) => ({ ...current, [productId]: errorMessage }));
    } finally {
      metricRequestRef.current.delete(productId);
      setMetricLoadingMap((current) => ({ ...current, [productId]: false }));
    }
  };

  const reloadMetricOptions = (productId?: number) => {
    if (!productId) {
      return;
    }
    setMetricOptionsMap((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setMetricErrorMap((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    void ensureMetricOptions(productId, true);
  };

  const getMetricLabelMap = (productId?: number) =>
    Object.fromEntries((productId ? metricOptionsMap[productId] || [] : []).map((item) => [item.value, item.label]));

  const fetchList = async () => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await alarmRuleApi.list({
        ...params,
        keyword: keyword || undefined,
        level: filterLevel,
      });
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const page = res.data.data as { records?: AlarmRuleRecord[]; total?: number } | undefined;
      const records = page?.records || [];
      setData(records);
      setTotal(page?.total || 0);
      setLoadError(null);
      ensureScopeLabels(records);
    } catch (error) {
      if (requestId === listRequestIdRef.current) {
        setLoadError(getErrorMessage(error, ALARM_TEXT.loadRuleError));
        setData([]);
        setTotal(0);
      }
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // The list API can already filter by enabled, so global counters come from three
  // page-size-1 queries instead of pretending the current page represents the tenant.
  const fetchGlobalStats = async () => {
    try {
      const [allRes, enabledRes, disabledRes] = await Promise.all([
        alarmRuleApi.list({ pageNum: 1, pageSize: 1 }),
        alarmRuleApi.list({ pageNum: 1, pageSize: 1, enabled: true }),
        alarmRuleApi.list({ pageNum: 1, pageSize: 1, enabled: false }),
      ]);
      setGlobalStats({
        total: readPageTotal(allRes),
        enabled: readPageTotal(enabledRes),
        disabled: readPageTotal(disabledRes),
      });
      setStatsError(null);
    } catch (error) {
      setGlobalStats(null);
      setStatsError(getErrorMessage(error, ALARM_TEXT.statsLoadFailed));
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchList(), fetchGlobalStats()]);
  };

  useEffect(() => {
    void fetchList();
    // Filters and pagination are the only inputs of fetchList; the function identity is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.pageNum, params.pageSize, filterLevel, keyword]);

  useEffect(() => {
    void loadNotifyOptions();
    void fetchGlobalStats();
    // Option lists and global counters only need to load once per page activation.
  }, []);

  useEffect(() => {
    if (createOpen && createProductId) {
      void ensureMetricOptions(createProductId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, createProductId]);

  useEffect(() => {
    if (editOpen && editProductId) {
      void ensureMetricOptions(editProductId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, editProductId]);

  useEffect(() => {
    data.forEach((item) => {
      if (item.productId) {
        void ensureMetricOptions(item.productId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const buildRulePayload = (values: Record<string, unknown>) => ({
    name: values.name,
    description: values.description,
    projectId: values.projectId,
    productId: values.productId,
    deviceId: values.deviceId,
    level: deriveAlarmRuleLevel(values as Parameters<typeof deriveAlarmRuleLevel>[0]),
    conditionExpr: buildAlarmConditionExpr(values as Parameters<typeof buildAlarmConditionExpr>[0]),
    notifyConfig: buildAlarmNotifyConfig(values as Parameters<typeof buildAlarmNotifyConfig>[0]),
    enabled: values.enabled,
  });

  const handleCreate = async (values: Record<string, unknown>) => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = { ...buildRulePayload(values) } as Record<string, unknown>;
      delete payload.enabled;
      await alarmRuleApi.create(payload);
      message.success(ALARM_TEXT.createRuleSuccess);
      closeCreateDrawer();
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, ALARM_TEXT.createRuleError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleEdit = (record: AlarmRuleRecord) => {
    setEditingId(record.id);
    const parsedCondition = parseAlarmConditionExpr(record.conditionExpr);
    const parsedNotify = parseAlarmNotifyConfig(record.notifyConfig);
    editForm.setFieldsValue({
      ...DEFAULT_RULE_FORM_VALUES,
      name: record.name,
      description: record.description,
      projectId: record.projectId,
      productId: record.productId,
      deviceId: record.deviceId,
      ...parsedCondition,
      ...parsedNotify,
      enabled: record.enabled,
    });
    if (record.productId) {
      void ensureMetricOptions(record.productId);
    }
    resetEditDrawerState();
    setEditTouched(false);
    setEditOpen(true);
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editingId || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await alarmRuleApi.update(editingId, buildRulePayload(values));
      message.success(ALARM_TEXT.updateRuleSuccess);
      closeEditDrawer();
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, ALARM_TEXT.updateRuleError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = (record: AlarmRuleRecord) => {
    Modal.confirm({
      title: ALARM_TEXT.deleteRuleTitle,
      content: `${ALARM_TEXT.deleteRuleMessagePrefix}${record.name}${ALARM_TEXT.deleteRuleMessageSuffix}`,
      okText: ALARM_TEXT.remove,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await alarmRuleApi.delete(record.id);
          message.success(ALARM_TEXT.deleteRuleSuccess);
          await refreshAll();
        } catch (error) {
          message.error(getErrorMessage(error, ALARM_TEXT.deleteRuleError));
        }
      },
    });
  };

  const clearFilters = () => {
    setKeyword('');
    setKeywordInput('');
    setFilterLevel(undefined);
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const renderScope = (record: AlarmRuleRecord) => {
    const tags = [
      record.projectId ? projectLabelMap[String(record.projectId)] : '',
      record.productId ? productLabelMap[String(record.productId)] : '',
      record.deviceId ? deviceLabelMap[String(record.deviceId)] : '',
    ].filter(Boolean);

    if (tags.length === 0) {
      return ALARM_TEXT.emptyScope;
    }

    return (
      <Space size={[4, 4]} wrap>
        {tags.map((item) => (
          <Tag key={item} color="default">
            {item}
          </Tag>
        ))}
      </Space>
    );
  };

  const columns: ColumnsType<AlarmRuleRecord> = [
    {
      title: ALARM_TEXT.ruleName,
      dataIndex: 'name',
      width: 220,
      render: (value: string, record: AlarmRuleRecord) => (
        <Space direction="vertical" size={2} style={{ maxWidth: '100%' }}>
          <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
          <Typography.Text type="secondary" ellipsis={{ tooltip: record.description }} style={{ fontSize: 12 }}>
            {record.description || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: ALARM_TEXT.scope,
      width: 280,
      render: (_: unknown, record: AlarmRuleRecord) => renderScope(record),
    },
    {
      title: ALARM_TEXT.level,
      dataIndex: 'level',
      width: 180,
      render: (_value: string, record: AlarmRuleRecord) => {
        const levels = getAlarmConditionLevels(record.conditionExpr);
        const visibleLevels = levels.length > 0 ? levels : [record.level as keyof typeof levelColors];
        return (
          <Space size={[4, 4]} wrap>
            {visibleLevels.map((item) => (
              <Tag key={item} color={levelColors[item] || 'default'}>
                {ALARM_LEVEL_LABELS[item] || item}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: ALARM_TEXT.triggerType,
      width: 220,
      render: (_: unknown, record: AlarmRuleRecord) => {
        const conditionTypes = getAlarmConditionTypes(record.conditionExpr);
        if (conditionTypes.length === 0) {
          return '-';
        }
        return (
          <Space size={[4, 4]} wrap>
            {conditionTypes.map((conditionType) => (
              <Tag key={conditionType} color={getAlarmConditionTypeColor(conditionType)}>
                {getAlarmConditionTypeLabel(conditionType)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: ALARM_TEXT.methodColumn,
      width: 220,
      render: (_: unknown, record: AlarmRuleRecord) => {
        const notifyConfig = parseAlarmNotifyConfig(record.notifyConfig);
        if ((notifyConfig.notifyChannels || []).length === 0) {
          return '-';
        }
        return (
          <Space size={[4, 4]} wrap>
            {(notifyConfig.notifyChannels || []).map((item) => (
              <Tag key={item} color="geekblue">
                {getAlarmNotificationMethodLabel(item)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: ALARM_TEXT.receiverColumn,
      width: 260,
      render: (_: unknown, record: AlarmRuleRecord) => {
        const receiverText = describeAlarmNotifyConfig(
          record.notifyConfig,
          recipientGroupLabelMap,
          recipientUserLabelMap,
        );
        return <CopyText text={receiverText} ellipsis style={{ width: '100%' }} />;
      },
    },
    {
      title: ALARM_TEXT.condition,
      dataIndex: 'conditionExpr',
      width: 360,
      render: (value: string, record: AlarmRuleRecord) => {
        const conditionText = describeAlarmConditionExpr(value, getMetricLabelMap(record.productId));
        return <CopyText text={conditionText} ellipsis style={{ width: '100%' }} />;
      },
    },
    {
      title: ALARM_TEXT.status,
      dataIndex: 'enabled',
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? 'success' : 'default'}>
          {value ? ALARM_TEXT.enabled : ALARM_TEXT.disabled}
        </Tag>
      ),
    },
    {
      title: ALARM_TEXT.createdAt,
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: ALARM_TEXT.action,
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: AlarmRuleRecord) => {
        if (!canUpdate && !canDelete) {
          return '-';
        }
        return (
          <Space>
            {canUpdate && (
              <Button type="link" size="small" onClick={() => handleEdit(record)}>
                {ALARM_TEXT.edit}
              </Button>
            )}
            {canDelete && (
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record)}
              >
                {ALARM_TEXT.remove}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const renderRuleDrawerFooter = (
    form: FormInstance<AlarmRuleFormValues>,
    steps: AlarmRuleDrawerStepConfig[],
    currentStepIndex: number,
    setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>,
    setMaxStepIndex: React.Dispatch<React.SetStateAction<number>>,
    onClose: () => void,
    submitLabel: string,
    isSubmitting: boolean,
  ) => {
    const isLastStep = currentStepIndex >= steps.length - 1;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          {ALARM_TEXT.close}
        </Button>
        <Space>
          <Button
            disabled={currentStepIndex === 0 || isSubmitting}
            onClick={() => setCurrentStepIndex((current) => Math.max(current - 1, 0))}
          >
            上一步
          </Button>
          {isLastStep ? (
            <Button
              type="primary"
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => {
                if (validateNotifyRecipients(form)) {
                  form.submit();
                }
              }}
            >
              {submitLabel}
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={isSubmitting}
              onClick={() => {
                void handleStepNext(form, steps, currentStepIndex, setCurrentStepIndex, setMaxStepIndex).catch(
                  () => undefined,
                );
              }}
            >
              下一步
            </Button>
          )}
        </Space>
      </div>
    );
  };

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <MiniStat
            title={`${ALARM_TEXT.totalRules}${ALARM_TEXT.allScopeSuffix}`}
            value={globalStats ? globalStats.total : '-'}
            icon={<SafetyCertificateOutlined />}
            color="#4f46e5"
            bg="rgba(79,70,229,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={`${ALARM_TEXT.enabledRules}${ALARM_TEXT.allScopeSuffix}`}
            value={globalStats ? globalStats.enabled : '-'}
            icon={<CheckCircleOutlined />}
            color="#10b981"
            bg="rgba(16,185,129,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={`${ALARM_TEXT.disabledRules}${ALARM_TEXT.allScopeSuffix}`}
            value={globalStats ? globalStats.disabled : '-'}
            icon={<CloseCircleOutlined />}
            color="#8c8c8c"
            bg="rgba(140,140,140,0.08)"
          />
        </Col>
      </Row>

      {statsError ? (
        <Alert
          type="warning"
          showIcon
          message={ALARM_TEXT.statsLoadFailed}
          description={statsError}
          action={
            <Button size="small" onClick={() => void fetchGlobalStats()}>
              {ALARM_TEXT.retry}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card
        bodyStyle={{ padding: '12px 16px' }}
        style={{
          borderRadius: 10,
          marginBottom: 16,
          border: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <Space wrap>
          <Input.Search
            value={keywordInput}
            placeholder={ALARM_TEXT.searchRule}
            allowClear
            enterButton="查询"
            style={{ width: 220 }}
            onChange={(event) => {
              const nextKeyword = event.target.value;
              setKeywordInput(nextKeyword);
              if (!nextKeyword) {
                setKeyword('');
                setParams((current) => ({ ...current, pageNum: 1 }));
              }
            }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
            value={filterLevel}
            placeholder={ALARM_TEXT.levelPlaceholder}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'CRITICAL', label: ALARM_LEVEL_LABELS.CRITICAL },
              { value: 'WARNING', label: ALARM_LEVEL_LABELS.WARNING },
              { value: 'INFO', label: ALARM_LEVEL_LABELS.INFO },
            ]}
            onChange={(value) => {
              setFilterLevel(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refreshAll()}>
            {ALARM_TEXT.refresh}
          </Button>
          {hasFilters && <Button onClick={clearFilters}>{ALARM_TEXT.clearFilters}</Button>}
          {canCreate && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.resetFields();
                createForm.setFieldsValue(DEFAULT_RULE_FORM_VALUES);
                resetCreateDrawerState();
                setCreateTouched(false);
                setCreateOpen(true);
              }}
            >
              {ALARM_TEXT.createRule}
            </Button>
          )}
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={ALARM_TEXT.loadRuleError}
            description={loadError}
            action={
              <Button size="small" onClick={() => void fetchList()}>
                {ALARM_TEXT.retry}
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1980 }}
          locale={{
            emptyText: loadError ? null : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText={ALARM_TEXT.emptyRule}
                filteredText={ALARM_TEXT.filteredRule}
                onClearFilters={clearFilters}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} ${ALARM_TEXT.countSuffix}`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Drawer
        title={ALARM_TEXT.createRuleTitle}
        open={createOpen}
        onClose={requestCloseCreateDrawer}
        destroyOnClose
        width={1120}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        styles={{ body: { paddingBottom: 24 } }}
        footer={renderRuleDrawerFooter(
          createForm,
          createDrawerSteps,
          createStepIndex,
          setCreateStepIndex,
          setCreateMaxStepIndex,
          requestCloseCreateDrawer,
          ALARM_TEXT.createRule,
          submitting,
        )}
      >
        <div style={{ marginBottom: 20 }}>
          <Steps
            current={createStepIndex}
            responsive
            items={createDrawerSteps}
            onChange={(targetStepIndex) => {
              if (!submitting) {
                handleVisitedStepChange(targetStepIndex, createMaxStepIndex, setCreateStepIndex);
              }
            }}
          />
        </div>
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          onValuesChange={() => setCreateTouched((previous) => (previous ? previous : true))}
          initialValues={DEFAULT_RULE_FORM_VALUES}
        >
          <AlarmRuleForm
            form={createForm}
            projectOptions={projectOptions}
            productOptions={productOptions}
            deviceOptions={deviceOptions}
            metricOptions={createProductId ? metricOptionsMap[createProductId] || [] : []}
            metricLoading={Boolean(createProductId && metricLoadingMap[createProductId])}
            metricLoaded={Boolean(createProductId && metricOptionsMap[createProductId] !== undefined)}
            metricError={createProductId ? metricErrorMap[createProductId] : undefined}
            onRetryMetric={() => reloadMetricOptions(createProductId)}
            metricLabelMap={getMetricLabelMap(createProductId)}
            notificationMethodOptions={notificationMethodOptions}
            recipientGroupOptions={recipientGroupOptions}
            recipientUserOptions={recipientUserOptions}
            currentStep={createDrawerSteps[createStepIndex].key}
          />
        </Form>
      </Drawer>

      <Drawer
        title={ALARM_TEXT.editRuleTitle}
        open={editOpen}
        onClose={requestCloseEditDrawer}
        destroyOnClose
        width={1120}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        styles={{ body: { paddingBottom: 24 } }}
        footer={renderRuleDrawerFooter(
          editForm,
          editDrawerSteps,
          editStepIndex,
          setEditStepIndex,
          setEditMaxStepIndex,
          requestCloseEditDrawer,
          ALARM_TEXT.save,
          submitting,
        )}
      >
        <div style={{ marginBottom: 20 }}>
          <Steps
            current={editStepIndex}
            responsive
            items={editDrawerSteps}
            onChange={(targetStepIndex) => {
              if (!submitting) {
                handleVisitedStepChange(targetStepIndex, editMaxStepIndex, setEditStepIndex);
              }
            }}
          />
        </div>
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
          onValuesChange={() => setEditTouched((previous) => (previous ? previous : true))}
        >
          <AlarmRuleForm
            form={editForm}
            projectOptions={projectOptions}
            productOptions={productOptions}
            deviceOptions={deviceOptions}
            metricOptions={editProductId ? metricOptionsMap[editProductId] || [] : []}
            metricLoading={Boolean(editProductId && metricLoadingMap[editProductId])}
            metricLoaded={Boolean(editProductId && metricOptionsMap[editProductId] !== undefined)}
            metricError={editProductId ? metricErrorMap[editProductId] : undefined}
            onRetryMetric={() => reloadMetricOptions(editProductId)}
            metricLabelMap={getMetricLabelMap(editProductId)}
            notificationMethodOptions={notificationMethodOptions}
            recipientGroupOptions={recipientGroupOptions}
            recipientUserOptions={recipientUserOptions}
            currentStep={editDrawerSteps[editStepIndex].key}
            showEnabled
          />
        </Form>
      </Drawer>
    </>
  );
};

export const AlarmRecordsPanel: React.FC = () => {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [data, setData] = useState<AlarmRecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filterLevel, setFilterLevel] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [recordStats, setRecordStats] = useState<Record<AlarmStatusKey, number> | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [rowPendingMap, setRowPendingMap] = useState<Record<number, RowAction>>({});
  const [batchAction, setBatchAction] = useState<RowAction | null>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AlarmRecordItem | null>(null);
  const [detailExtras, setDetailExtras] = useState<AlarmDetailExtras>({});
  const [processForm] = Form.useForm();
  const listRequestIdRef = useRef(0);
  const rowPendingRef = useRef<Set<number>>(new Set());
  const batchActionRef = useRef(false);
  const processSubmittingRef = useRef(false);
  const detailRequestIdRef = useRef(0);

  const canConfirm = hasPermission('alarm:confirm');
  const canProcess = hasPermission('alarm:process');
  const hasFilters = Boolean(keyword || filterLevel || filterStatus);

  const fetchList = async () => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await alarmRecordApi.list({
        ...params,
        keyword: keyword || undefined,
        level: filterLevel,
        status: filterStatus,
      });
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const page = res.data.data as { records?: AlarmRecordItem[]; total?: number } | undefined;
      setData(page?.records || []);
      setTotal(page?.total || 0);
      setLoadError(null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (requestId === listRequestIdRef.current) {
        setLoadError(getErrorMessage(error, ALARM_TEXT.loadRecordError));
        setData([]);
        setTotal(0);
      }
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // The record query supports a status filter, so each global counter is an independent
  // filtered total rather than a count of the current page.
  const fetchGlobalStats = async () => {
    const statusKeys: AlarmStatusKey[] = ['TRIGGERED', 'CONFIRMED', 'PROCESSED', 'CLOSED'];
    try {
      const responses = await Promise.all(
        statusKeys.map((status) => alarmRecordApi.list({ pageNum: 1, pageSize: 1, status })),
      );
      const [triggered, confirmed, processed, closed] = responses.map(readPageTotal);
      setRecordStats({ TRIGGERED: triggered, CONFIRMED: confirmed, PROCESSED: processed, CLOSED: closed });
      setStatsError(null);
    } catch (error) {
      setRecordStats(null);
      setStatsError(getErrorMessage(error, ALARM_TEXT.statsLoadFailed));
    }
  };

  const refreshAll = async () => {
    // fetchList only stamps lastUpdatedAt after a successful list response, so a failed
    // poll does not make the page look freshly updated.
    await Promise.all([fetchList(), fetchGlobalStats()]);
  };

  const { paused, togglePaused, refresh: refreshNow } = useAutoRefresh(refreshAll, {
    intervalMs: 30000,
    immediate: false,
  });

  useEffect(() => {
    // The table is paginated and not using preserveSelectedRowKeys; a stale selection from
    // another page would make the batch count disagree with the rows the user can see.
    setSelectedRowKeys([]);
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.pageNum, params.pageSize, filterLevel, filterStatus, keyword]);

  useEffect(() => {
    void fetchGlobalStats();
  }, []);

  const selectedRecords = useMemo(
    () => data.filter((item) => selectedRowKeys.includes(item.id)),
    [data, selectedRowKeys],
  );
  const processingRecord = useMemo(
    () => data.find((item) => item.id === processingId),
    [data, processingId],
  );

  const clearFilters = () => {
    setKeyword('');
    setKeywordInput('');
    setFilterLevel(undefined);
    setFilterStatus(undefined);
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const runRowAction = async (id: number, action: RowAction, task: () => Promise<void>) => {
    if (rowPendingRef.current.has(id)) {
      return;
    }
    rowPendingRef.current.add(id);
    setRowPendingMap((current) => ({ ...current, [id]: action }));
    try {
      await task();
    } finally {
      rowPendingRef.current.delete(id);
      setRowPendingMap((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const handleConfirm = async (record: AlarmRecordItem) => {
    await runRowAction(record.id, 'confirm', async () => {
      try {
        await alarmRecordApi.confirm(record.id);
        message.success(ALARM_TEXT.confirmSuccess);
        await refreshAll();
      } catch (error) {
        message.error(getErrorMessage(error, ALARM_TEXT.confirmError));
      }
    });
  };

  const handleProcess = (id: number) => {
    setProcessingId(id);
    processForm.resetFields();
    setProcessOpen(true);
  };

  const handleProcessSubmit = async (values: Record<string, unknown>) => {
    if (!processingId || processSubmittingRef.current) {
      return;
    }
    processSubmittingRef.current = true;
    setProcessSubmitting(true);
    try {
      await alarmRecordApi.process(processingId, values);
      message.success(ALARM_TEXT.processSuccess);
      setProcessOpen(false);
      setProcessingId(null);
      processForm.resetFields();
      await refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, ALARM_TEXT.processError));
    } finally {
      processSubmittingRef.current = false;
      setProcessSubmitting(false);
    }
  };

  const handleClose = (record: AlarmRecordItem) => {
    if (rowPendingRef.current.has(record.id)) {
      return;
    }
    Modal.confirm({
      title: ALARM_TEXT.closeConfirmTitle,
      content: `${ALARM_TEXT.closeConfirmContentPrefix}${record.title}${ALARM_TEXT.closeConfirmContentSuffix}`,
      okText: ALARM_TEXT.close,
      okButtonProps: { danger: true },
      onOk: () =>
        runRowAction(record.id, 'close', async () => {
          try {
            await alarmRecordApi.close(record.id);
            message.success(ALARM_TEXT.closeSuccess);
            await refreshAll();
          } catch (error) {
            message.error(getErrorMessage(error, ALARM_TEXT.closeError));
          }
        }),
    });
  };

  const handleBatch = (action: RowAction) => {
    if (batchActionRef.current) {
      return;
    }
    const eligible = selectedRecords.filter((record) => {
      if (rowPendingRef.current.has(record.id)) {
        return false;
      }
      return action === 'confirm' ? record.status === 'TRIGGERED' : record.status !== 'CLOSED';
    });
    if (eligible.length === 0) {
      message.warning(ALARM_TEXT.batchNoEligible);
      return;
    }
    const skippedCount = selectedRecords.length - eligible.length;
    const isClose = action === 'close';
    Modal.confirm({
      title: isClose ? ALARM_TEXT.batchCloseTitle : ALARM_TEXT.batchConfirmTitle,
      content: isClose
        ? `将关闭 ${eligible.length} 条告警${skippedCount > 0 ? `，跳过 ${skippedCount} 条当前不可操作的记录` : ''}。关闭后不可再处理。`
        : `将确认 ${eligible.length} 条告警${skippedCount > 0 ? `，跳过 ${skippedCount} 条当前状态不可确认的记录` : ''}。`,
      okText: isClose ? ALARM_TEXT.batchClose : ALARM_TEXT.batchConfirm,
      okButtonProps: isClose ? { danger: true } : undefined,
      onOk: async () => {
        if (batchActionRef.current) {
          return;
        }
        batchActionRef.current = true;
        setBatchAction(action);
        const failures: Array<{ title: string; reason: string }> = [];
        let successCount = 0;
        for (const record of eligible) {
          try {
            if (isClose) {
              await alarmRecordApi.close(record.id);
            } else {
              await alarmRecordApi.confirm(record.id);
            }
            successCount += 1;
          } catch (error) {
            failures.push({
              title: record.title,
              reason: getErrorMessage(error, isClose ? ALARM_TEXT.closeError : ALARM_TEXT.confirmError),
            });
          }
        }
        batchActionRef.current = false;
        setBatchAction(null);
        setSelectedRowKeys([]);
        await refreshAll();
        if (failures.length > 0) {
          Modal.error({
            title: isClose
              ? `${ALARM_TEXT.batchCloseResultPrefix}${successCount}${ALARM_TEXT.batchResultMiddle}${failures.length}${ALARM_TEXT.batchResultSuffix}`
              : `${ALARM_TEXT.batchConfirmResultPrefix}${successCount}${ALARM_TEXT.batchResultMiddle}${failures.length}${ALARM_TEXT.batchResultSuffix}`,
            width: 560,
            content: (
              <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                {failures.map((failure, failureIndex) => (
                  <li key={`${failureIndex}-${failure.title}`}>
                    <Typography.Text strong>{failure.title}</Typography.Text>
                    <Typography.Text type="secondary">{`：${failure.reason}`}</Typography.Text>
                  </li>
                ))}
              </ul>
            ),
          });
        } else {
          message.success(
            isClose
              ? `${ALARM_TEXT.batchCloseResultPrefix}${successCount}${ALARM_TEXT.batchResultSuffix}`
              : `${ALARM_TEXT.batchConfirmResultPrefix}${successCount}${ALARM_TEXT.batchResultSuffix}`,
          );
        }
      },
    });
  };

  const loadDetailExtras = async (detail: AlarmRecordItem, requestId: number) => {
    const { alarmRuleId, productId, deviceId, confirmedBy, processedBy } = detail;
    const [ruleName, productName, deviceName, confirmedByName, processedByName] = await Promise.all([
      alarmRuleId
        ? resolveOptional(async () => {
            const res = await alarmRuleApi.get(alarmRuleId);
            return (res.data.data as AlarmRuleRecord | undefined)?.name;
          })
        : Promise.resolve(undefined),
      productId
        ? resolveOptional(async () => {
            const res = await productApi.get(productId);
            const product = res.data.data as ProductRecord | undefined;
            return product?.name || product?.productKey;
          })
        : Promise.resolve(undefined),
      deviceId
        ? resolveOptional(async () => {
            const res = await deviceApi.get(deviceId);
            const device = res.data.data as DeviceRecord | undefined;
            return device?.nickname ? `${device.nickname}（${device.deviceName || '-'}）` : device?.deviceName;
          })
        : Promise.resolve(undefined),
      confirmedBy
        ? resolveOptional(async () => {
            const res = await userApi.get(confirmedBy);
            const user = res.data.data as UserDetailRecord | undefined;
            return user?.realName ? `${user.realName}（@${user.username || '-'}）` : user?.username;
          })
        : Promise.resolve(undefined),
      processedBy
        ? resolveOptional(async () => {
            const res = await userApi.get(processedBy);
            const user = res.data.data as UserDetailRecord | undefined;
            return user?.realName ? `${user.realName}（@${user.username || '-'}）` : user?.username;
          })
        : Promise.resolve(undefined),
    ]);
    if (requestId === detailRequestIdRef.current) {
      setDetailExtras({ ruleName, productName, deviceName, confirmedByName, processedByName });
    }
  };

  const openDetail = async (record: AlarmRecordItem) => {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setDetailOpen(true);
    setDetailRecord(record);
    setDetailExtras({});
    setDetailLoading(true);
    try {
      const res = await alarmRecordApi.get(record.id);
      if (requestId !== detailRequestIdRef.current) {
        return;
      }
      const detail = (res.data.data || record) as AlarmRecordItem;
      setDetailRecord(detail);
      setDetailLoading(false);
      // Names are secondary information: show the record immediately and fill names in place.
      await loadDetailExtras(detail, requestId);
    } catch (error) {
      if (requestId === detailRequestIdRef.current) {
        message.error(getErrorMessage(error, ALARM_TEXT.loadRecordDetailError));
      }
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setDetailLoading(false);
      }
    }
  };

  const closeDetail = () => {
    detailRequestIdRef.current += 1;
    setDetailOpen(false);
    setDetailRecord(null);
    setDetailExtras({});
  };

  const columns: ColumnsType<AlarmRecordItem> = [
    {
      title: ALARM_TEXT.title,
      dataIndex: 'title',
      width: 240,
      render: (value: string) => (
        <Typography.Text ellipsis={{ tooltip: value }} style={{ maxWidth: 220 }}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: ALARM_TEXT.content,
      dataIndex: 'content',
      width: 260,
      render: (value?: string) => <CopyText text={value} ellipsis style={{ width: '100%' }} />,
    },
    {
      title: ALARM_TEXT.level,
      dataIndex: 'level',
      width: 100,
      render: (value: string) => <Tag color={levelColors[value]}>{ALARM_LEVEL_LABELS[value] || value}</Tag>,
    },
    {
      title: ALARM_TEXT.status,
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={statusColors[value]}>{ALARM_STATUS_LABELS[value] || value}</Tag>,
    },
    {
      title: ALARM_TEXT.triggerValue,
      dataIndex: 'triggerValue',
      width: 180,
      render: (value?: string) => <CopyText text={value} ellipsis style={{ width: '100%' }} />,
    },
    {
      title: ALARM_TEXT.triggerTime,
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: ALARM_TEXT.processRemark,
      dataIndex: 'processRemark',
      width: 220,
      render: (value?: string) => <CopyText text={value} ellipsis style={{ width: '100%' }} />,
    },
    {
      title: ALARM_TEXT.action,
      width: 320,
      fixed: 'right',
      render: (_: unknown, record: AlarmRecordItem) => {
        const actions: React.ReactNode[] = [
          <Button key="detail" type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record)}>
            {ALARM_TEXT.detail}
          </Button>,
        ];
        if (record.status === 'TRIGGERED' && canConfirm) {
          actions.push(
            <Button
              key="confirm"
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              loading={rowPendingMap[record.id] === 'confirm'}
              disabled={Boolean(rowPendingMap[record.id])}
              onClick={() => void handleConfirm(record)}
            >
              {ALARM_TEXT.confirm}
            </Button>,
          );
        }
        if ((record.status === 'TRIGGERED' || record.status === 'CONFIRMED') && canProcess) {
          actions.push(
            <Button
              key="process"
              type="link"
              size="small"
              icon={<ToolOutlined />}
              disabled={Boolean(rowPendingMap[record.id])}
              onClick={() => handleProcess(record.id)}
            >
              {ALARM_TEXT.process}
            </Button>,
          );
        }
        if (record.status !== 'CLOSED' && canProcess) {
          actions.push(
            <Button
              key="close"
              type="link"
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              loading={rowPendingMap[record.id] === 'close'}
              disabled={Boolean(rowPendingMap[record.id])}
              onClick={() => handleClose(record)}
            >
              {ALARM_TEXT.close}
            </Button>,
          );
        }
        return actions.length > 0 ? <Space size={0}>{actions}</Space> : '-';
      },
    },
  ];

  const rowSelection = canConfirm || canProcess
    ? {
        selectedRowKeys,
        onChange: (nextKeys: React.Key[]) => setSelectedRowKeys(nextKeys),
      }
    : undefined;

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          {
            key: 'triggered',
            title: `${ALARM_TEXT.triggered}${ALARM_TEXT.allScopeSuffix}`,
            value: recordStats ? recordStats.TRIGGERED : '-',
            icon: <FireOutlined />,
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.08)',
          },
          {
            key: 'confirmed',
            title: `${ALARM_TEXT.confirmed}${ALARM_TEXT.allScopeSuffix}`,
            value: recordStats ? recordStats.CONFIRMED : '-',
            icon: <WarningOutlined />,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
          },
          {
            key: 'processed',
            title: `${ALARM_TEXT.processed}${ALARM_TEXT.allScopeSuffix}`,
            value: recordStats ? recordStats.PROCESSED : '-',
            icon: <ToolOutlined />,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
          },
          {
            key: 'closed',
            title: `${ALARM_TEXT.closed}${ALARM_TEXT.allScopeSuffix}`,
            value: recordStats ? recordStats.CLOSED : '-',
            icon: <CheckCircleOutlined />,
            color: '#10b981',
            bg: 'rgba(16,185,129,0.08)',
          },
        ].map((item) => (
          <Col xs={12} sm={6} key={item.key}>
            <MiniStat {...item} />
          </Col>
        ))}
      </Row>

      {statsError ? (
        <Alert
          type="warning"
          showIcon
          message={ALARM_TEXT.statsLoadFailed}
          description={statsError}
          action={
            <Button size="small" onClick={() => void fetchGlobalStats()}>
              {ALARM_TEXT.retry}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card
        bodyStyle={{ padding: '12px 16px' }}
        style={{
          borderRadius: 10,
          marginBottom: 16,
          border: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Input.Search
              value={keywordInput}
              placeholder={ALARM_TEXT.searchRecord}
              allowClear
              enterButton="查询"
              style={{ width: 220 }}
              onChange={(event) => {
                const nextKeyword = event.target.value;
                setKeywordInput(nextKeyword);
                if (!nextKeyword) {
                  setKeyword('');
                  setParams((current) => ({ ...current, pageNum: 1 }));
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setParams((current) => ({ ...current, pageNum: 1 }));
              }}
            />
            <Select
              value={filterLevel}
              placeholder={ALARM_TEXT.levelPlaceholder}
              allowClear
              style={{ width: 140 }}
              options={[
                { value: 'CRITICAL', label: ALARM_LEVEL_LABELS.CRITICAL },
                { value: 'WARNING', label: ALARM_LEVEL_LABELS.WARNING },
                { value: 'INFO', label: ALARM_LEVEL_LABELS.INFO },
              ]}
              onChange={(value) => {
                setFilterLevel(value);
                setParams((current) => ({ ...current, pageNum: 1 }));
              }}
            />
            <Select
              value={filterStatus}
              placeholder={ALARM_TEXT.processStatus}
              allowClear
              style={{ width: 140 }}
              options={[
                { value: 'TRIGGERED', label: ALARM_TEXT.triggered },
                { value: 'CONFIRMED', label: ALARM_TEXT.confirmed },
                { value: 'PROCESSED', label: ALARM_TEXT.processed },
                { value: 'CLOSED', label: ALARM_TEXT.closed },
              ]}
              onChange={(value) => {
                setFilterStatus(value);
                setParams((current) => ({ ...current, pageNum: 1 }));
              }}
            />
            {hasFilters && <Button onClick={clearFilters}>{ALARM_TEXT.clearFilters}</Button>}
          </Space>

          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refreshNow()}>
              {ALARM_TEXT.refresh}
            </Button>
            <Button
              icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              onClick={togglePaused}
            >
              {paused ? ALARM_TEXT.resumeAutoRefresh : ALARM_TEXT.pauseAutoRefresh}
            </Button>
            <Typography.Text type="secondary">
              {paused ? ALARM_TEXT.autoRefreshPaused : ALARM_TEXT.autoRefreshRunning}
            </Typography.Text>
            <Typography.Text type="secondary">
              {`${ALARM_TEXT.lastRefreshAt}：${lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}`}
            </Typography.Text>
          </Space>

          {selectedRowKeys.length > 0 ? (
            <Space wrap>
              <Typography.Text type="secondary">
                {`${ALARM_TEXT.batchSelectedPrefix}${selectedRowKeys.length}${ALARM_TEXT.batchSelectedSuffix}`}
              </Typography.Text>
              {canConfirm && (
                <Button
                  loading={batchAction === 'confirm'}
                  disabled={batchAction !== null}
                  onClick={() => handleBatch('confirm')}
                >
                  {ALARM_TEXT.batchConfirm}
                </Button>
              )}
              {canProcess && (
                <Button
                  danger
                  loading={batchAction === 'close'}
                  disabled={batchAction !== null}
                  onClick={() => handleBatch('close')}
                >
                  {ALARM_TEXT.batchClose}
                </Button>
              )}
              <Button type="link" onClick={() => setSelectedRowKeys([])}>
                取消选择
              </Button>
            </Space>
          ) : null}
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={ALARM_TEXT.loadRecordError}
            description={loadError}
            action={
              <Button size="small" onClick={() => void fetchList()}>
                {ALARM_TEXT.retry}
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1780 }}
          locale={{
            emptyText: loadError ? null : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText={ALARM_TEXT.emptyRecord}
                filteredText={ALARM_TEXT.filteredRecord}
                onClearFilters={clearFilters}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} ${ALARM_TEXT.countSuffix}`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal
        title={processingRecord ? `${ALARM_TEXT.processTitle}：${processingRecord.title}` : ALARM_TEXT.processTitle}
        open={processOpen}
        onCancel={() => {
          if (processSubmitting) {
            return;
          }
          setProcessOpen(false);
          setProcessingId(null);
        }}
        onOk={() => processForm.submit()}
        confirmLoading={processSubmitting}
        cancelButtonProps={{ disabled: processSubmitting }}
        closable={!processSubmitting}
        maskClosable={!processSubmitting}
        destroyOnClose
        width={480}
      >
        <Form form={processForm} layout="vertical" onFinish={handleProcessSubmit}>
          <Form.Item name="processRemark" label={ALARM_TEXT.processRemark}>
            <TextArea rows={3} maxLength={1000} placeholder={ALARM_TEXT.processRemarkPlaceholder} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={ALARM_TEXT.detailTitle}
        open={detailOpen}
        onClose={closeDetail}
        width={720}
        destroyOnClose
        loading={detailLoading}
      >
        {detailRecord ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={ALARM_TEXT.title} span={2}>
              {detailRecord.title}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.level}>
              <Tag color={levelColors[detailRecord.level]}>
                {ALARM_LEVEL_LABELS[detailRecord.level] || detailRecord.level}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.status}>
              <Tag color={statusColors[detailRecord.status]}>
                {ALARM_STATUS_LABELS[detailRecord.status] || detailRecord.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailRule}>{detailExtras.ruleName || '-'}</Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailDevice}>{detailExtras.deviceName || '-'}</Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailProduct}>{detailExtras.productName || '-'}</Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.triggerTime}>
              {formatDateTime(detailRecord.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailConfirmedAt}>
              {formatDateTime(detailRecord.confirmedAt)}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailConfirmedBy}>
              {detailExtras.confirmedByName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailProcessedAt}>
              {formatDateTime(detailRecord.processedAt)}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailProcessedBy}>
              {detailExtras.processedByName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.triggerValue} span={2}>
              <CopyText text={detailRecord.triggerValue} />
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.detailContent} span={2}>
              <CopyText text={detailRecord.content} style={{ alignItems: 'flex-start' }}>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detailRecord.content || '-'}</span>
              </CopyText>
            </Descriptions.Item>
            <Descriptions.Item label={ALARM_TEXT.processRemark} span={2}>
              <CopyText text={detailRecord.processRemark} style={{ alignItems: 'flex-start' }}>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detailRecord.processRemark || '-'}
                </span>
              </CopyText>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </>
  );
};

export const AlarmPageBadge: React.FC = () => (
  <Badge dot offset={[6, 0]}>
    <AlertOutlined style={{ marginRight: 6 }} />
    {ALARM_TEXT.badge}
  </Badge>
);
