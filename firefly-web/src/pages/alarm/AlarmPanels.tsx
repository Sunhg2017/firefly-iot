import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FireOutlined,
  PlusOutlined,
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
import { ALARM_LEVEL_LABELS, ALARM_STATUS_LABELS, ALARM_TEXT } from './alarmText';
import AlarmRuleForm, {
  type AlarmMetricOption,
  type AlarmNotificationMethodOption,
  type AlarmRecipientGroupOption,
  type AlarmRecipientUserOption,
  type AlarmScopeOption,
} from './AlarmRuleForm';
import {
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

const MiniStat: React.FC<{
  title: string;
  value: number;
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
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [filterLevel, setFilterLevel] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [projectOptions, setProjectOptions] = useState<AlarmScopeOption[]>([]);
  const [productOptions, setProductOptions] = useState<AlarmScopeOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<AlarmScopeOption[]>([]);
  const [notificationMethodOptions, setNotificationMethodOptions] = useState<AlarmNotificationMethodOption[]>([]);
  const [recipientGroupOptions, setRecipientGroupOptions] = useState<AlarmRecipientGroupOption[]>([]);
  const [recipientUserOptions, setRecipientUserOptions] = useState<AlarmRecipientUserOption[]>([]);
  const [metricOptionsMap, setMetricOptionsMap] = useState<Record<number, AlarmMetricOption[]>>({});
  const [metricLoadingMap, setMetricLoadingMap] = useState<Record<number, boolean>>({});

  const canCreate = hasPermission('alarm:create');
  const canUpdate = hasPermission('alarm:update');
  const canDelete = hasPermission('alarm:delete');
  const createProductId = Form.useWatch('productId', createForm) as number | undefined;
  const editProductId = Form.useWatch('productId', editForm) as number | undefined;

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

  const loadScopeOptions = async () => {
    try {
      const [projectRes, productRes, deviceRes] = await Promise.all([
        projectApi.list({ pageNum: 1, pageSize: 500 }),
        productApi.list({ pageNum: 1, pageSize: 500 }),
        deviceApi.list({ pageNum: 1, pageSize: 500 }),
      ]);

      const projectRecords = (projectRes.data.data?.records || []) as ProjectRecord[];
      const productRecords = (productRes.data.data?.records || []) as ProductRecord[];
      const deviceRecords = (deviceRes.data.data?.records || []) as DeviceRecord[];

      setProjectOptions(projectRecords.map(buildProjectOption));
      setProductOptions(productRecords.map(buildProductOption));
      setDeviceOptions(deviceRecords.map(buildDeviceOption));
    } catch {
      message.error(ALARM_TEXT.loadScopeError);
    }
  };

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
    } catch {
      message.error(ALARM_TEXT.loadNotifyOptionsError);
    }
  };

  const ensureMetricOptions = async (productId?: number) => {
    if (!productId || metricOptionsMap[productId] || metricLoadingMap[productId]) {
      return;
    }

    setMetricLoadingMap((current) => ({ ...current, [productId]: true }));
    try {
      const res = await productApi.getThingModel(productId);
      const nextOptions = parseThingModelMetricOptions(res.data.data);
      setMetricOptionsMap((current) => ({ ...current, [productId]: nextOptions }));
    } catch {
      message.error(ALARM_TEXT.loadThingModelError);
      setMetricOptionsMap((current) => ({ ...current, [productId]: [] }));
    } finally {
      setMetricLoadingMap((current) => ({ ...current, [productId]: false }));
    }
  };

  const getMetricLabelMap = (productId?: number) =>
    Object.fromEntries((productId ? metricOptionsMap[productId] || [] : []).map((item) => [item.value, item.label]));

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRuleApi.list({
        ...params,
        keyword: keyword || undefined,
        level: filterLevel,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error(ALARM_TEXT.loadRuleError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, filterLevel, keyword]);

  useEffect(() => {
    void loadScopeOptions();
    void loadNotifyOptions();
  }, []);

  useEffect(() => {
    if (createOpen && createProductId) {
      void ensureMetricOptions(createProductId);
    }
  }, [createOpen, createProductId]);

  useEffect(() => {
    if (editOpen && editProductId) {
      void ensureMetricOptions(editProductId);
    }
  }, [editOpen, editProductId]);

  useEffect(() => {
    data.forEach((item) => {
      if (item.productId) {
        void ensureMetricOptions(item.productId);
      }
    });
  }, [data]);

  const ruleStats = useMemo(
    () => ({
      total,
      enabled: data.filter((item) => item.enabled).length,
      disabled: data.filter((item) => !item.enabled).length,
    }),
    [data, total],
  );

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
    try {
      const { enabled: _enabled, ...payload } = buildRulePayload(values);
      await alarmRuleApi.create(payload);
      message.success(ALARM_TEXT.createRuleSuccess);
      setCreateOpen(false);
      createForm.resetFields();
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : ALARM_TEXT.createRuleError);
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
    setEditOpen(true);
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editingId) {
      return;
    }
    try {
      await alarmRuleApi.update(editingId, buildRulePayload(values));
      message.success(ALARM_TEXT.updateRuleSuccess);
      setEditOpen(false);
      setEditingId(null);
      editForm.resetFields();
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : ALARM_TEXT.updateRuleError);
    }
  };

  const handleDelete = (record: AlarmRuleRecord) => {
    Modal.confirm({
      title: ALARM_TEXT.deleteRuleTitle,
      content: `${ALARM_TEXT.deleteRuleMessagePrefix}${record.name}${ALARM_TEXT.deleteRuleMessageSuffix}`,
      onOk: async () => {
        try {
          await alarmRuleApi.delete(record.id);
          message.success(ALARM_TEXT.deleteRuleSuccess);
          await fetchData();
        } catch {
          message.error(ALARM_TEXT.deleteRuleError);
        }
      },
    });
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
      ellipsis: true,
      render: (value: string, record: AlarmRuleRecord) => (
        <Space direction="vertical" size={2}>
          <span>{value}</span>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.description || '-'}</span>
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
      render: (_: unknown, record: AlarmRuleRecord) =>
        describeAlarmNotifyConfig(record.notifyConfig, recipientGroupLabelMap, recipientUserLabelMap),
    },
    {
      title: ALARM_TEXT.condition,
      dataIndex: 'conditionExpr',
      width: 360,
      ellipsis: true,
      render: (value: string, record: AlarmRuleRecord) =>
        describeAlarmConditionExpr(value, getMetricLabelMap(record.productId)),
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
    { title: ALARM_TEXT.createdAt, dataIndex: 'createdAt', width: 180 },
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

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <MiniStat
            title={ALARM_TEXT.totalRules}
            value={ruleStats.total}
            icon={<SafetyCertificateOutlined />}
            color="#4f46e5"
            bg="rgba(79,70,229,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={ALARM_TEXT.enabledRules}
            value={ruleStats.enabled}
            icon={<CheckCircleOutlined />}
            color="#10b981"
            bg="rgba(16,185,129,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={ALARM_TEXT.disabledRules}
            value={ruleStats.disabled}
            icon={<CloseCircleOutlined />}
            color="#8c8c8c"
            bg="rgba(140,140,140,0.08)"
          />
        </Col>
      </Row>

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
            placeholder={ALARM_TEXT.searchRule}
            allowClear
            style={{ width: 220 }}
            onSearch={(value) => {
              setKeyword(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
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
          {canCreate && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.setFieldsValue(DEFAULT_RULE_FORM_VALUES);
                setCreateOpen(true);
              }}
            >
              {ALARM_TEXT.createRule}
            </Button>
          )}
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ marginBottom: 16 }}>
          <Space align="start" size={12}>
            <AlertOutlined style={{ color: '#1677ff', fontSize: 18, marginTop: 4 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{ALARM_TEXT.conditionTypeSummary}</div>
              <div style={{ color: '#8c8c8c', fontSize: 13 }}>{ALARM_TEXT.conditionTypeDescription}</div>
            </div>
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1820 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `\u5171 ${count} ${ALARM_TEXT.countSuffix}`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Drawer
        title={ALARM_TEXT.createRuleTitle}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        destroyOnClose
        width={1120}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setCreateOpen(false)}>{ALARM_TEXT.close}</Button>
            <Button type="primary" onClick={() => createForm.submit()}>
              {ALARM_TEXT.createRule}
            </Button>
          </Space>
        }
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={DEFAULT_RULE_FORM_VALUES}
        >
          <AlarmRuleForm
            form={createForm}
            projectOptions={projectOptions}
            productOptions={productOptions}
            deviceOptions={deviceOptions}
            metricOptions={createProductId ? metricOptionsMap[createProductId] || [] : []}
            metricLabelMap={getMetricLabelMap(createProductId)}
            notificationMethodOptions={notificationMethodOptions}
            recipientGroupOptions={recipientGroupOptions}
            recipientUserOptions={recipientUserOptions}
          />
        </Form>
      </Drawer>

      <Drawer
        title={ALARM_TEXT.editRuleTitle}
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditingId(null);
        }}
        destroyOnClose
        width={1120}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              onClick={() => {
                setEditOpen(false);
                setEditingId(null);
              }}
            >
              {ALARM_TEXT.close}
            </Button>
            <Button type="primary" onClick={() => editForm.submit()}>
              {ALARM_TEXT.edit}
            </Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <AlarmRuleForm
            form={editForm}
            projectOptions={projectOptions}
            productOptions={productOptions}
            deviceOptions={deviceOptions}
            metricOptions={editProductId ? metricOptionsMap[editProductId] || [] : []}
            metricLabelMap={getMetricLabelMap(editProductId)}
            notificationMethodOptions={notificationMethodOptions}
            recipientGroupOptions={recipientGroupOptions}
            recipientUserOptions={recipientUserOptions}
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
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filterLevel, setFilterLevel] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [processOpen, setProcessOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [processForm] = Form.useForm();

  const canConfirm = hasPermission('alarm:confirm');
  const canProcess = hasPermission('alarm:process');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRecordApi.list({
        ...params,
        keyword: keyword || undefined,
        level: filterLevel,
        status: filterStatus,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error(ALARM_TEXT.loadRecordError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, filterLevel, filterStatus, keyword]);

  const recordStats = useMemo(
    () => ({
      triggered: data.filter((item) => item.status === 'TRIGGERED').length,
      confirmed: data.filter((item) => item.status === 'CONFIRMED').length,
      processed: data.filter((item) => item.status === 'PROCESSED').length,
      closed: data.filter((item) => item.status === 'CLOSED').length,
    }),
    [data],
  );

  const handleConfirm = async (id: number) => {
    try {
      await alarmRecordApi.confirm(id);
      message.success(ALARM_TEXT.confirmSuccess);
      await fetchData();
    } catch {
      message.error(ALARM_TEXT.confirmError);
    }
  };

  const handleProcess = (id: number) => {
    setProcessingId(id);
    setProcessOpen(true);
  };

  const handleProcessSubmit = async (values: Record<string, unknown>) => {
    if (!processingId) {
      return;
    }
    try {
      await alarmRecordApi.process(processingId, values);
      message.success(ALARM_TEXT.processSuccess);
      setProcessOpen(false);
      setProcessingId(null);
      processForm.resetFields();
      await fetchData();
    } catch {
      message.error(ALARM_TEXT.processError);
    }
  };

  const handleClose = async (id: number) => {
    try {
      await alarmRecordApi.close(id);
      message.success(ALARM_TEXT.closeSuccess);
      await fetchData();
    } catch {
      message.error(ALARM_TEXT.closeError);
    }
  };

  const columns: ColumnsType<AlarmRecordItem> = [
    { title: ALARM_TEXT.title, dataIndex: 'title', width: 240, ellipsis: true },
    {
      title: ALARM_TEXT.level,
      dataIndex: 'level',
      width: 100,
      render: (value: string) => (
        <Tag color={levelColors[value]}>{ALARM_LEVEL_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: ALARM_TEXT.status,
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={statusColors[value]}>{ALARM_STATUS_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: ALARM_TEXT.triggerValue,
      dataIndex: 'triggerValue',
      width: 160,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    { title: ALARM_TEXT.triggerTime, dataIndex: 'createdAt', width: 180 },
    {
      title: ALARM_TEXT.processRemark,
      dataIndex: 'processRemark',
      width: 220,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: ALARM_TEXT.action,
      width: 260,
      fixed: 'right',
      render: (_: unknown, record: AlarmRecordItem) => {
        const actions: React.ReactNode[] = [];
        if (record.status === 'TRIGGERED' && canConfirm) {
          actions.push(
            <Button
              key="confirm"
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleConfirm(record.id)}
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
              icon={<CloseCircleOutlined />}
              onClick={() => handleClose(record.id)}
            >
              {ALARM_TEXT.close}
            </Button>,
          );
        }
        return actions.length > 0 ? <Space>{actions}</Space> : '-';
      },
    },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          {
            key: 'triggered',
            title: ALARM_TEXT.triggered,
            value: recordStats.triggered,
            icon: <FireOutlined />,
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.08)',
          },
          {
            key: 'confirmed',
            title: ALARM_TEXT.confirmed,
            value: recordStats.confirmed,
            icon: <WarningOutlined />,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
          },
          {
            key: 'processed',
            title: ALARM_TEXT.processed,
            value: recordStats.processed,
            icon: <ToolOutlined />,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
          },
          {
            key: 'closed',
            title: ALARM_TEXT.closed,
            value: recordStats.closed,
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
            placeholder={ALARM_TEXT.searchRecord}
            allowClear
            style={{ width: 220 }}
            onSearch={(value) => {
              setKeyword(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
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
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `\u5171 ${count} ${ALARM_TEXT.countSuffix}`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal
        title={ALARM_TEXT.processTitle}
        open={processOpen}
        onCancel={() => {
          setProcessOpen(false);
          setProcessingId(null);
        }}
        onOk={() => processForm.submit()}
        destroyOnClose
        width={480}
      >
        <Form form={processForm} layout="vertical" onFinish={handleProcessSubmit}>
          <Form.Item name="processRemark" label={ALARM_TEXT.processRemark}>
            <TextArea rows={3} placeholder={ALARM_TEXT.processRemarkPlaceholder} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export const AlarmPageBadge: React.FC = () => (
  <Badge dot offset={[6, 0]}>
    <AlertOutlined style={{ marginRight: 6 }} />
    {ALARM_TEXT.badge}
  </Badge>
);
