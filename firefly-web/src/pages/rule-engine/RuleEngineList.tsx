import React, { useEffect, useMemo, useState } from 'react';
import {
  AutoComplete,
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
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { projectApi, ruleApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

type RuleStatus = 'ENABLED' | 'DISABLED';
type RuleActionType = 'KAFKA_FORWARD' | 'WEBHOOK' | 'EMAIL' | 'SMS' | 'DEVICE_COMMAND';

interface RuleActionRecord {
  id?: number;
  actionType: RuleActionType;
  actionConfig?: string;
  sortOrder?: number;
  enabled?: boolean;
}

interface RuleRecord {
  id: number;
  projectId?: number;
  name: string;
  description?: string;
  sqlExpr: string;
  status: RuleStatus;
  triggerCount: number;
  successCount: number;
  errorCount: number;
  lastTriggerAt?: string;
  createdAt: string;
  actions?: RuleActionRecord[];
}

interface ProjectOption {
  id: number;
  code?: string;
  name: string;
}

interface ParsedRuleExpression {
  selectClause: string;
  sourcePattern: string;
  whereClause: string;
}

interface RuleFormValues {
  projectId?: number;
  name: string;
  description?: string;
  sourcePattern: string;
  matchCondition?: string;
  outputExpr?: string;
  actions?: RuleActionRecord[];
}

interface DerivedRuleRecord extends RuleRecord {
  parsedExpression: ParsedRuleExpression;
}

interface RuleListFilters {
  keyword: string;
  status?: RuleStatus;
  projectId?: number;
}

const statusMeta: Record<RuleStatus, { label: string; color: string }> = {
  ENABLED: { label: '运行中', color: 'success' },
  DISABLED: { label: '已停用', color: 'default' },
};

const actionTypeMeta: Record<
  RuleActionType,
  { label: string; shortLabel: string; color: string; template: Record<string, unknown> }
> = {
  KAFKA_FORWARD: {
    label: 'Kafka 转发',
    shortLabel: 'Kafka',
    color: 'blue',
    template: {
      topic: 'runtime.alerts',
      key: '${deviceId}',
      payload: { deviceName: '${deviceName}', value: '${payloadJson}' },
    },
  },
  WEBHOOK: {
    label: 'Webhook',
    shortLabel: 'Webhook',
    color: 'cyan',
    template: {
      url: 'https://example.com/hooks/device-event',
      method: 'POST',
      body: { deviceName: '${deviceName}', payload: '${payloadJson}' },
    },
  },
  EMAIL: {
    label: '邮件通知',
    shortLabel: '邮件',
    color: 'gold',
    template: {
      channelId: 1,
      templateCode: 'device_alert',
      recipient: 'ops@example.com',
      variables: { deviceName: '${deviceName}' },
    },
  },
  SMS: {
    label: '短信通知',
    shortLabel: '短信',
    color: 'purple',
    template: {
      channelId: 1,
      templateCode: 'device_alert',
      recipient: '13800000000',
      variables: { deviceName: '${deviceName}' },
    },
  },
  DEVICE_COMMAND: {
    label: '设备命令',
    shortLabel: '命令',
    color: 'green',
    template: {
      commandType: 'PROPERTY_SET',
      payload: { targetValue: '${payload.value}' },
    },
  },
};

const actionTypeOptions = Object.entries(actionTypeMeta).map(([value, meta]) => ({ value, label: meta.label }));

const sourceSuggestions = [
  { value: 'PROPERTY_REPORT', label: '消息类型 · 属性上报' },
  { value: 'EVENT_REPORT', label: '消息类型 · 事件上报' },
  { value: '/sys/*/thing/property/post', label: '设备 Topic · 属性上报' },
  { value: '/sys/*/thing/event/post', label: '设备 Topic · 事件上报' },
  { value: '/sys/http/*/thing/property/post', label: 'HTTP Topic · 属性上报' },
  { value: '/sys/http/*/thing/event/post', label: 'HTTP Topic · 事件上报' },
];

const defaultExpression: ParsedRuleExpression = {
  selectClause: '*',
  sourcePattern: '',
  whereClause: '',
};

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseRuleExpression(sqlExpr?: string): ParsedRuleExpression {
  if (!sqlExpr) {
    return defaultExpression;
  }
  // The backend still persists a single sqlExpr, so the console splits it into structured fields here.
  const normalized = sqlExpr.replace(/\r\n/g, '\n').trim();
  const match = normalized.match(
    /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))\s*(?:WHERE\s+([\s\S]+?))?\s*$/i,
  );
  if (!match) {
    return {
      selectClause: normalized || '*',
      sourcePattern: '',
      whereClause: '',
    };
  }
  const sourcePattern = match[2]?.trim() || match[3]?.trim() || match[4]?.trim() || '';
  return {
    selectClause: match[1]?.trim() || '*',
    sourcePattern,
    whereClause: match[5]?.trim() || '',
  };
}

function buildRuleExpression(values: Pick<RuleFormValues, 'sourcePattern' | 'matchCondition' | 'outputExpr'>): string {
  const sourcePattern = normalizeOptionalText(values.sourcePattern);
  const matchCondition = normalizeOptionalText(values.matchCondition);
  const outputExpr = normalizeOptionalText(values.outputExpr) || '*';

  if (!sourcePattern) {
    return '';
  }

  return ['SELECT ' + outputExpr, `FROM '${sourcePattern}'`, matchCondition ? 'WHERE ' + matchCondition : '']
    .filter(Boolean)
    .join('\n');
}

function formatJsonForEditor(raw?: string): string {
  const normalized = normalizeOptionalText(raw);
  if (!normalized) {
    return JSON.stringify({}, null, 2);
  }
  try {
    return JSON.stringify(JSON.parse(normalized), null, 2);
  } catch {
    return normalized;
  }
}

function getActionTemplate(actionType?: RuleActionType): string {
  if (!actionType) {
    return JSON.stringify({}, null, 2);
  }
  return JSON.stringify(actionTypeMeta[actionType].template, null, 2);
}

function parseActionConfig(actionConfig?: string): Record<string, unknown> | null {
  const normalized = normalizeOptionalText(actionConfig);
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getActionSummary(action: RuleActionRecord): string {
  const meta = actionTypeMeta[action.actionType];
  const config = parseActionConfig(action.actionConfig);
  if (!config) {
    return meta.label;
  }

  if (action.actionType === 'KAFKA_FORWARD' && typeof config.topic === 'string') {
    return `${meta.label} · ${config.topic}`;
  }
  if (action.actionType === 'WEBHOOK' && typeof config.url === 'string') {
    return `${meta.label} · ${config.url}`;
  }
  if ((action.actionType === 'EMAIL' || action.actionType === 'SMS') && typeof config.recipient === 'string') {
    return `${meta.label} · ${config.recipient}`;
  }
  if (action.actionType === 'DEVICE_COMMAND' && typeof config.commandType === 'string') {
    return `${meta.label} · ${config.commandType}`;
  }
  return meta.label;
}

function getSourceKind(sourcePattern?: string): string {
  if (!sourcePattern) {
    return '未设置来源';
  }
  return /^[A-Z_]+$/.test(sourcePattern) ? '消息类型' : 'Topic';
}

function getOutputSummary(expression: ParsedRuleExpression): string {
  if (!expression.selectClause || expression.selectClause === '*') {
    return '使用完整上下文';
  }
  return expression.selectClause;
}

function buildProjectLabel(project: ProjectOption): string {
  return project.code ? `${project.name} (${project.code})` : project.name;
}

function normalizeActions(actions: RuleActionRecord[] | undefined): RuleActionRecord[] {
  return (actions || []).map((action, index) => {
    const actionType = action.actionType;
    if (!actionType) {
      throw new Error(`第 ${index + 1} 个动作未选择类型`);
    }

    const actionConfig = normalizeOptionalText(action.actionConfig) || '{}';
    try {
      JSON.parse(actionConfig);
    } catch {
      throw new Error(`第 ${index + 1} 个动作配置不是合法 JSON`);
    }

    return {
      id: action.id,
      actionType,
      actionConfig,
      sortOrder: index + 1,
      enabled: action.enabled !== false,
    };
  });
}

const RuleEngineList: React.FC = () => {
  const [data, setData] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftFilters, setDraftFilters] = useState<RuleListFilters>({ keyword: '' });
  const [filters, setFilters] = useState<RuleListFilters>({ keyword: '' });
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [form] = Form.useForm<RuleFormValues>();

  const watchedSourcePattern = Form.useWatch('sourcePattern', form);
  const watchedMatchCondition = Form.useWatch('matchCondition', form);
  const watchedOutputExpr = Form.useWatch('outputExpr', form);

  const projectLabelMap = useMemo(
    () => new Map(projects.map((project) => [project.id, buildProjectLabel(project)])),
    [projects],
  );

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: buildProjectLabel(project),
      })),
    [projects],
  );

  const expressionPreview = useMemo(
    () =>
      buildRuleExpression({
        sourcePattern: watchedSourcePattern,
        matchCondition: watchedMatchCondition,
        outputExpr: watchedOutputExpr,
      }),
    [watchedMatchCondition, watchedOutputExpr, watchedSourcePattern],
  );

  const derivedRecords = useMemo<DerivedRuleRecord[]>(
    () =>
      data.map((record) => ({
        ...record,
        parsedExpression: parseRuleExpression(record.sqlExpr),
      })),
    [data],
  );

  const stats = useMemo(() => {
    const enabled = derivedRecords.filter((item) => item.status === 'ENABLED').length;
    const totalTriggers = derivedRecords.reduce((sum, item) => sum + (item.triggerCount || 0), 0);
    const totalSuccess = derivedRecords.reduce((sum, item) => sum + (item.successCount || 0), 0);
    const totalActions = derivedRecords.reduce((sum, item) => sum + (item.actions?.length || 0), 0);
    const sourceList = derivedRecords
      .map((item) => item.parsedExpression.sourcePattern)
      .filter((item): item is string => Boolean(item));
    const sourceCount = new Set(sourceList).size;
    const actionTypeCounter = new Map<string, number>();
    let latestTriggerTime = '';

    derivedRecords.forEach((item) => {
      (item.actions || []).forEach((action) => {
        actionTypeCounter.set(action.actionType, (actionTypeCounter.get(action.actionType) || 0) + 1);
      });

      if (item.lastTriggerAt) {
        const currentTime = new Date(item.lastTriggerAt).getTime();
        const latestTime = latestTriggerTime ? new Date(latestTriggerTime).getTime() : 0;
        if (!latestTriggerTime || currentTime > latestTime) {
          latestTriggerTime = item.lastTriggerAt;
        }
      }
    });

    const actionPreview = Array.from(actionTypeCounter.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([actionType]) => actionTypeMeta[actionType as RuleActionType]?.shortLabel || actionType);

    return {
      enabled,
      totalTriggers,
      totalActions,
      sourceCount,
      sourcePreview: sourceList.slice(0, 2),
      actionPreview,
      successRate: totalTriggers ? Math.round((totalSuccess / totalTriggers) * 100) : 0,
      latestTriggerTime,
    };
  }, [derivedRecords]);

  const loadProjects = async () => {
    try {
      const res = await projectApi.list({ pageNum: 1, pageSize: 500 });
      setProjects(res.data.data?.records || []);
    } catch {
      setProjects([]);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await ruleApi.list({
        ...params,
        keyword: normalizeOptionalText(filters.keyword),
        status: filters.status,
        projectId: filters.projectId,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadRules();
  }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      status: draftFilters.status,
      projectId: draftFilters.projectId,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const openCreateDrawer = () => {
    setDrawerMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ outputExpr: '*', actions: [] });
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setEditingId(null);
    form.resetFields();
  };

  const openEditDrawer = async (record: RuleRecord) => {
    setDrawerMode('edit');
    setEditingId(record.id);
    try {
      const res = await ruleApi.get(record.id);
      const detail = res.data.data as RuleRecord;
      const parsedExpression = parseRuleExpression(detail.sqlExpr);
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        projectId: detail.projectId,
        sourcePattern: parsedExpression.sourcePattern,
        matchCondition: parsedExpression.whereClause,
        outputExpr: parsedExpression.selectClause || '*',
        actions: (detail.actions || []).map((action) => ({
          ...action,
          enabled: action.enabled !== false,
          actionConfig: formatJsonForEditor(action.actionConfig),
        })),
      });
    } catch {
      message.error('加载规则详情失败');
      setDrawerMode(null);
      setEditingId(null);
    }
  };

  const upsertActionTemplate = (index: number, actionType?: RuleActionType) => {
    if (!actionType) {
      return;
    }
    const currentActions = (form.getFieldValue('actions') || []) as RuleActionRecord[];
    const nextActions = [...currentActions];
    nextActions[index] = {
      ...nextActions[index],
      actionType,
      enabled: nextActions[index]?.enabled !== false,
      actionConfig: getActionTemplate(actionType),
    };
    form.setFieldsValue({ actions: nextActions });
  };

  const handleActionTypeChange = (index: number, actionType: RuleActionType) => {
    const currentActions = (form.getFieldValue('actions') || []) as RuleActionRecord[];
    const currentAction = currentActions[index];
    // Only auto-fill when the row is still empty, so switching type does not silently wipe edited JSON.
    const shouldFillTemplate = !normalizeOptionalText(currentAction?.actionConfig);
    const nextActions = [...currentActions];
    nextActions[index] = {
      ...currentAction,
      actionType,
      enabled: currentAction?.enabled !== false,
      actionConfig: shouldFillTemplate ? getActionTemplate(actionType) : currentAction?.actionConfig,
    };
    form.setFieldsValue({ actions: nextActions });
  };

  const handleSubmit = async (values: RuleFormValues) => {
    const sqlExpr = buildRuleExpression(values);
    if (!sqlExpr) {
      message.error('请填写消息来源');
      return;
    }

    let actions: RuleActionRecord[];
    try {
      actions = normalizeActions(values.actions);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '动作配置校验失败');
      return;
    }

    if (actions.length === 0) {
      message.error('请至少添加一个动作');
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: normalizeOptionalText(values.description),
      projectId: values.projectId,
      sqlExpr,
      actions,
    };

    setSubmitting(true);
    try {
      if (drawerMode === 'edit' && editingId) {
        await ruleApi.update(editingId, payload);
        message.success('规则已更新');
      } else {
        await ruleApi.create(payload);
        message.success('规则已创建');
      }
      closeDrawer();
      void loadRules();
    } catch {
      message.error(drawerMode === 'edit' ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (record: RuleRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await ruleApi.disable(record.id);
        message.success('规则已停用');
      } else {
        await ruleApi.enable(record.id);
        message.success('规则已启用');
      }
      void loadRules();
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = (record: RuleRecord) => {
    Modal.confirm({
      title: '确认删除规则',
      content: `删除后不可恢复，确认删除“${record.name}”？`,
      onOk: async () => {
        try {
          await ruleApi.delete(record.id);
          message.success('规则已删除');
          void loadRules();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<DerivedRuleRecord> = [
    {
      title: '规则信息',
      dataIndex: 'name',
      width: 260,
      render: (_: unknown, record) => (
        <div className="rule-engine-list-cell">
          <div className="rule-engine-list-cell__header">
            <Text strong>{record.name}</Text>
            <Tag color={statusMeta[record.status].color}>{statusMeta[record.status].label}</Tag>
          </div>
          {record.description ? (
            <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ marginBottom: 8 }}>
              {record.description}
            </Paragraph>
          ) : null}
          <Tag bordered={false} className="rule-engine-soft-tag">
            {record.projectId ? projectLabelMap.get(record.projectId) || `项目 ${record.projectId}` : '全部项目'}
          </Tag>
        </div>
      ),
    },
    {
      title: '消息入口',
      width: 220,
      render: (_: unknown, record) => (
        <div className="rule-engine-list-cell">
          <Tag color="processing" style={{ marginBottom: 8 }}>
            {getSourceKind(record.parsedExpression.sourcePattern)}
          </Tag>
          <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
            {record.parsedExpression.sourcePattern || '未识别来源'}
          </Paragraph>
        </div>
      ),
    },
    {
      title: '匹配与输出',
      width: 320,
      render: (_: unknown, record) => (
        <div className="rule-engine-list-cell">
          <div className="rule-engine-list-cell__group">
            <Text type="secondary">条件</Text>
            <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
              {record.parsedExpression.whereClause || '命中来源后直接执行'}
            </Paragraph>
          </div>
          <div className="rule-engine-list-cell__group">
            <Text type="secondary">输出</Text>
            <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
              {getOutputSummary(record.parsedExpression)}
            </Paragraph>
          </div>
        </div>
      ),
    },
    {
      title: '动作链路',
      width: 280,
      render: (_: unknown, record) => (
        <div className="rule-engine-list-cell">
          <Space size={[8, 8]} wrap style={{ marginBottom: 8 }}>
            {(record.actions || []).map((action, index) => (
              <Tag key={`${record.id}-${action.actionType}-${index}`} color={actionTypeMeta[action.actionType].color}>
                {actionTypeMeta[action.actionType].shortLabel}
              </Tag>
            ))}
            {!record.actions?.length ? <Tag>未配置动作</Tag> : null}
          </Space>
          {(record.actions || []).slice(0, 2).map((action, index) => (
            <Paragraph key={`${record.id}-summary-${index}`} ellipsis={{ rows: 1 }} type="secondary" style={{ marginBottom: 4 }}>
              {getActionSummary(action)}
            </Paragraph>
          ))}
          {record.actions && record.actions.length > 2 ? <Text type="secondary">另有 {record.actions.length - 2} 个动作</Text> : null}
        </div>
      ),
    },
    {
      title: '运行结果',
      width: 220,
      render: (_: unknown, record) => (
        <div className="rule-engine-result-cell">
          <div className="rule-engine-result-cell__numbers">
            <span>命中 {record.triggerCount || 0}</span>
            <span className="rule-engine-result-cell__success">成功 {record.successCount || 0}</span>
            <span className="rule-engine-result-cell__error">失败 {record.errorCount || 0}</span>
          </div>
          <Text type="secondary">最近触发：{record.lastTriggerAt ? formatDateTime(record.lastTriggerAt) : '暂无'}</Text>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => void handleToggle(record)}
          >
            {record.status === 'ENABLED' ? '停用' : '启用'}
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={record.status === 'ENABLED'} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="设备联动规则"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            新建联动规则
          </Button>
        }
      />

      <div className="rule-engine-overview-shell">
        <div className="rule-engine-overview-card">
          <div className="rule-engine-overview-card__icon">
            <ApartmentOutlined />
          </div>
          <div>
            <div className="rule-engine-overview-card__label">消息来源</div>
            <div className="rule-engine-overview-card__value">{stats.sourceCount}</div>
            <div className="rule-engine-overview-card__caption">
              {stats.sourcePreview.length ? stats.sourcePreview.join(' · ') : '暂无已配置来源'}
            </div>
          </div>
        </div>
        <div className="rule-engine-overview-card">
          <div className="rule-engine-overview-card__icon">
            <BranchesOutlined />
          </div>
          <div>
            <div className="rule-engine-overview-card__label">生效规则</div>
            <div className="rule-engine-overview-card__value">
              {stats.enabled}/{total}
            </div>
            <div className="rule-engine-overview-card__caption">累计命中 {stats.totalTriggers} 次</div>
          </div>
        </div>
        <div className="rule-engine-overview-card">
          <div className="rule-engine-overview-card__icon">
            <SendOutlined />
          </div>
          <div>
            <div className="rule-engine-overview-card__label">执行动作</div>
            <div className="rule-engine-overview-card__value">{stats.totalActions}</div>
            <div className="rule-engine-overview-card__caption">
              {stats.actionPreview.length ? stats.actionPreview.join(' / ') : '暂无动作编排'}
            </div>
          </div>
        </div>
        <div className="rule-engine-overview-card">
          <div className="rule-engine-overview-card__icon">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="rule-engine-overview-card__label">最近结果</div>
            <div className="rule-engine-overview-card__value">{stats.successRate}%</div>
            <div className="rule-engine-overview-card__caption">
              {stats.latestTriggerTime ? `最近触发 ${formatDateTime(stats.latestTriggerTime)}` : '暂无触发记录'}
            </div>
          </div>
        </div>
      </div>

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            allowClear
            placeholder="搜索规则名称"
            value={draftFilters.keyword}
            onChange={(event) => {
              setDraftFilters((current) => ({ ...current, keyword: event.target.value }));
            }}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            options={[
              { value: 'ENABLED', label: '运行中' },
              { value: 'DISABLED', label: '已停用' },
            ]}
            value={draftFilters.status}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, status: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="项目范围"
            style={{ width: 220 }}
            options={projectOptions}
            value={draftFilters.projectId}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, projectId: value }));
            }}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={derivedRecords}
          loading={loading}
          scroll={{ x: 1600 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条`,
            onChange: (pageNum, pageSize) => setParams({ pageNum, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={drawerMode === 'edit' ? '编辑联动规则' : '新建联动规则'}
        open={drawerMode !== null}
        onClose={closeDrawer}
        destroyOnClose
        width={920}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              {drawerMode === 'edit' ? '保存修改' : '创建规则'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <div className="rule-engine-drawer-section">
            <div className="rule-engine-drawer-section__title">基本信息</div>
            <Row gutter={[16, 0]}>
              <Col span={12}>
                <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
                  <Input maxLength={256} placeholder="例如：高温设备告警联动" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="projectId" label="项目范围">
                  <Select allowClear placeholder="不选则作用于全部项目" options={projectOptions} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="规则说明">
              <TextArea rows={2} placeholder="填写这条规则的业务用途，方便后续识别" />
            </Form.Item>
          </div>

          <div className="rule-engine-drawer-section">
            <div className="rule-engine-drawer-section__title">消息匹配</div>
            <Form.Item name="sourcePattern" label="消息来源" rules={[{ required: true, message: '请选择或输入消息来源' }]}>
              <AutoComplete
                options={sourceSuggestions}
                placeholder="支持消息类型或 Topic，例如 PROPERTY_REPORT 或 /sys/*/thing/property/post"
                filterOption={(inputValue, option) =>
                  String(option?.value || '')
                    .toLowerCase()
                    .includes(inputValue.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item name="matchCondition" label="命中条件">
              <TextArea
                rows={3}
                placeholder="例如：payload.temperature >= 80 AND deviceName == 'dev-001'"
                style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
              />
            </Form.Item>
            <Form.Item name="outputExpr" label="输出字段">
              <TextArea
                rows={3}
                placeholder="留空默认使用完整上下文，示例：payload.temperature AS temp, deviceName"
                style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
              />
            </Form.Item>
            <div className="rule-engine-expression-preview">
              <div className="rule-engine-expression-preview__label">规则表达式</div>
              <pre className="rule-engine-expression-preview__code">{expressionPreview || "SELECT *\nFROM ''"}</pre>
            </div>
          </div>

          <div className="rule-engine-drawer-section">
            <div className="rule-engine-drawer-section__title">执行动作</div>
            <Form.List name="actions">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => {
                    const currentActionType = form.getFieldValue(['actions', name, 'actionType']) as RuleActionType | undefined;
                    return (
                      <div key={key} className="rule-engine-action-card">
                        <div className="rule-engine-action-card__header">
                          <div>
                            <div className="rule-engine-action-card__title">动作 {name + 1}</div>
                            <Text type="secondary">
                              {currentActionType ? actionTypeMeta[currentActionType].label : '选择动作类型后可直接填入模板'}
                            </Text>
                          </div>
                          <Space size={12}>
                            <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" initialValue={true} style={{ marginBottom: 0 }}>
                              <Switch checkedChildren="启用" unCheckedChildren="停用" />
                            </Form.Item>
                            <Button type="text" danger onClick={() => remove(name)}>
                              删除
                            </Button>
                          </Space>
                        </div>
                        <Row gutter={[16, 0]}>
                          <Col span={8}>
                            <Form.Item
                              {...restField}
                              name={[name, 'actionType']}
                              label="动作类型"
                              rules={[{ required: true, message: '请选择动作类型' }]}
                            >
                              <Select
                                placeholder="请选择动作类型"
                                options={actionTypeOptions}
                                onChange={(value: RuleActionType) => handleActionTypeChange(name, value)}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={16}>
                            <Form.Item
                              {...restField}
                              name={[name, 'actionConfig']}
                              label="动作配置"
                              rules={[{ required: true, message: '请输入动作配置 JSON' }]}
                            >
                              <TextArea
                                rows={8}
                                placeholder={currentActionType ? getActionTemplate(currentActionType) : '请选择动作类型后填写 JSON'}
                                style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                        <div className="rule-engine-action-card__footer">
                          <Button type="link" disabled={!currentActionType} onClick={() => upsertActionTemplate(name, currentActionType)}>
                            填入模板
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ enabled: true })}>
                    添加动作
                  </Button>
                </>
              )}
            </Form.List>
          </div>
        </Form>
      </Drawer>
    </div>
  );
};

export default RuleEngineList;
