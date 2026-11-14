import React, { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { dataForwardRuleApi, projectApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

const { TextArea } = Input;

type ForwardStatus = 'ENABLED' | 'DISABLED';
type TargetType = 'MQTT' | 'AMQP' | 'TSDB' | 'WEBHOOK';

interface DataForwardRuleRecord {
  id: number;
  projectId?: number;
  name: string;
  description?: string;
  sourcePattern: string;
  matchCondition?: string;
  targetType: TargetType;
  targetConfig: string;
  status: ForwardStatus;
  triggerCount: number;
  successCount: number;
  errorCount: number;
  lastTriggerAt?: string;
  createdAt: string;
}

interface DataForwardRuleFormValues {
  projectId?: number;
  name: string;
  description?: string;
  sourcePattern: string;
  matchCondition?: string;
  targetType: TargetType;
  targetConfig: string;
}

interface ProjectOption {
  id: number;
  code?: string;
  name: string;
}

const statusMeta: Record<ForwardStatus, { label: string; color: string }> = {
  ENABLED: { label: '运行中', color: 'success' },
  DISABLED: { label: '已停用', color: 'default' },
};

const targetTypeMeta: Record<TargetType, { label: string; color: string; template: Record<string, unknown> }> = {
  MQTT: {
    label: 'MQTT 桥接',
    color: 'blue',
    template: {
      broker: 'tcp://emqx.example.com:1883',
      username: 'forward',
      password: '',
      clientIdPrefix: 'firefly-forward',
      topic: 'firefly/${deviceName}/up',
      qos: 1,
      retained: false,
      payloadTemplate: { deviceName: '${deviceName}', payload: '${payloadJson}' },
    },
  },
  AMQP: {
    label: 'RabbitMQ',
    color: 'purple',
    template: {
      host: 'rabbitmq.example.com',
      port: 5672,
      vhost: '/',
      username: 'forward',
      password: '',
      exchange: 'firefly',
      exchangeType: 'topic',
      routingKey: 'device.${deviceName}',
      payloadTemplate: { deviceName: '${deviceName}', payload: '${payloadJson}' },
    },
  },
  TSDB: {
    label: '时序库',
    color: 'cyan',
    template: {
      engine: 'INFLUXDB',
      url: 'http://influxdb.example.com:8086',
      token: '',
      org: 'firefly',
      bucket: 'device-data',
      measurement: 'device_telemetry',
      tags: { deviceName: '${deviceName}' },
      fields: { temperature: '${payload.temperature}' },
    },
  },
  WEBHOOK: {
    label: 'Webhook',
    color: 'green',
    template: {
      url: 'https://example.com/hooks/device-event',
      method: 'POST',
      headers: {},
      body: { deviceName: '${deviceName}', payload: '${payloadJson}' },
    },
  },
};

const targetTypeOptions = (Object.keys(targetTypeMeta) as TargetType[]).map((value) => ({
  value,
  label: targetTypeMeta[value].label,
}));

const sourceSuggestions = [
  { value: 'PROPERTY_REPORT', label: '消息类型 · 属性上报' },
  { value: 'EVENT_REPORT', label: '消息类型 · 事件上报' },
  { value: 'DEVICE_ONLINE', label: '消息类型 · 设备上线' },
  { value: 'DEVICE_OFFLINE', label: '消息类型 · 设备离线' },
  { value: 'OTA_PROGRESS', label: '消息类型 · OTA 进度' },
  { value: '/sys/*/thing/property/post', label: '设备 Topic · 属性上报' },
];

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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

function getTargetTemplate(targetType?: TargetType): string {
  if (!targetType) {
    return JSON.stringify({}, null, 2);
  }
  return JSON.stringify(targetTypeMeta[targetType].template, null, 2);
}

function buildProjectLabel(project: ProjectOption): string {
  return project.code ? `${project.name} (${project.code})` : project.name;
}

const DataForwardRulePage: React.FC = () => {
  const [data, setData] = useState<DataForwardRuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filters, setFilters] = useState<{ keyword: string; status?: ForwardStatus; targetType?: TargetType }>({ keyword: '' });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; status?: ForwardStatus; targetType?: TargetType }>({ keyword: '' });
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [form] = Form.useForm<DataForwardRuleFormValues>();

  const watchedTargetType = Form.useWatch('targetType', form);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: buildProjectLabel(project) })),
    [projects],
  );

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
      const res = await dataForwardRuleApi.list({
        pageNum: params.pageNum,
        pageSize: params.pageSize,
        keyword: normalizeOptionalText(filters.keyword),
        status: filters.status,
        targetType: filters.targetType,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载数据流转规则失败');
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
      targetType: draftFilters.targetType,
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
    form.setFieldsValue({ targetType: 'MQTT', targetConfig: getTargetTemplate('MQTT') });
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setEditingId(null);
    form.resetFields();
  };

  const openEditDrawer = async (record: DataForwardRuleRecord) => {
    setDrawerMode('edit');
    setEditingId(record.id);
    try {
      const res = await dataForwardRuleApi.get(record.id);
      const detail = res.data.data as DataForwardRuleRecord;
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        projectId: detail.projectId,
        sourcePattern: detail.sourcePattern,
        matchCondition: detail.matchCondition,
        targetType: detail.targetType,
        targetConfig: formatJsonForEditor(detail.targetConfig),
      });
    } catch {
      message.error('加载规则详情失败');
      setDrawerMode(null);
      setEditingId(null);
    }
  };

  const handleTargetTypeChange = (targetType: TargetType) => {
    const currentConfig = form.getFieldValue('targetConfig');
    const shouldFillTemplate = !normalizeOptionalText(currentConfig) || currentConfig?.trim() === '{}';
    if (shouldFillTemplate) {
      form.setFieldsValue({ targetConfig: getTargetTemplate(targetType) });
    }
  };

  const handleSubmit = async (values: DataForwardRuleFormValues) => {
    let targetConfig: string;
    try {
      const parsed = JSON.parse(values.targetConfig);
      targetConfig = JSON.stringify(parsed);
    } catch {
      message.error('目标配置不是合法 JSON');
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: normalizeOptionalText(values.description),
      projectId: values.projectId,
      sourcePattern: values.sourcePattern.trim(),
      matchCondition: normalizeOptionalText(values.matchCondition),
      targetType: values.targetType,
      targetConfig,
    };

    setSubmitting(true);
    try {
      if (drawerMode === 'edit' && editingId) {
        await dataForwardRuleApi.update(editingId, payload);
        message.success('规则已更新');
      } else {
        await dataForwardRuleApi.create(payload);
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

  const handleToggle = async (record: DataForwardRuleRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await dataForwardRuleApi.disable(record.id);
        message.success('规则已停用');
      } else {
        await dataForwardRuleApi.enable(record.id);
        message.success('规则已启用');
      }
      void loadRules();
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = (record: DataForwardRuleRecord) => {
    Modal.confirm({
      title: '确认删除规则',
      content: `删除后不可恢复，确认删除“${record.name}”？`,
      onOk: async () => {
        try {
          await dataForwardRuleApi.delete(record.id);
          message.success('规则已删除');
          void loadRules();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<DataForwardRuleRecord> = [
    { title: '规则名称', dataIndex: 'name', render: (value: string) => value || '-' },
    {
      title: '转发目标',
      dataIndex: 'targetType',
      width: 120,
      render: (value: TargetType) => <Tag color={targetTypeMeta[value]?.color}>{targetTypeMeta[value]?.label || value}</Tag>,
    },
    { title: '消息源', dataIndex: 'sourcePattern', ellipsis: true, render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ForwardStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>,
    },
    {
      title: '触发/成功/失败',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Tag color="blue">{record.triggerCount || 0}</Tag>
          <Tag color="green">{record.successCount || 0}</Tag>
          <Tag color="red">{record.errorCount || 0}</Tag>
        </Space>
      ),
    },
    { title: '最近触发', dataIndex: 'lastTriggerAt', width: 170, render: (value?: string) => (value ? formatDateTime(value) : '-') },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
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
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="数据流转规则"
        description="按消息源匹配并过滤设备数据，转发到第三方 MQTT Broker、RabbitMQ、时序库或 Webhook。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            新建规则
          </Button>
        }
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="规则名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
            style={{ width: 220 }}
          />
          <Select
            placeholder="转发目标"
            allowClear
            value={draftFilters.targetType}
            options={targetTypeOptions}
            onChange={(value) => setDraftFilters((current) => ({ ...current, targetType: value }))}
            style={{ width: 140 }}
          />
          <Select
            placeholder="状态"
            allowClear
            value={draftFilters.status}
            options={[
              { value: 'ENABLED', label: '运行中' },
              { value: 'DISABLED', label: '已停用' },
            ]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
            style={{ width: 120 }}
          />
          <Button type="primary" onClick={applyFilters}>
            查询
          </Button>
          <Button onClick={resetFilters}>重置</Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            onChange: (pageNum, pageSize) => setParams({ pageNum, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={drawerMode === 'edit' ? '编辑数据流转规则' : '新建数据流转规则'}
        width={560}
        open={drawerMode !== null}
        onClose={closeDrawer}
        destroyOnClose
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：温度数据转发到客户 MQTT" maxLength={256} />
          </Form.Item>
          <Form.Item name="projectId" label="所属项目">
            <Select placeholder="选择项目（可选）" allowClear options={projectOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="sourcePattern" label="消息源" rules={[{ required: true, message: '请输入消息源' }]}>
            <AutoComplete options={sourceSuggestions} placeholder="消息类型名或 Topic 通配，如 PROPERTY_REPORT" />
          </Form.Item>
          <Form.Item name="matchCondition" label="过滤条件（可选）">
            <Input placeholder="SpEL 表达式，如 payload.temperature > 50" />
          </Form.Item>
          <Form.Item name="targetType" label="转发目标" rules={[{ required: true, message: '请选择转发目标' }]}>
            <Select options={targetTypeOptions} onChange={handleTargetTypeChange} />
          </Form.Item>
          <Form.Item
            name="targetConfig"
            label="目标配置"
            rules={[{ required: true, message: '请输入目标配置' }]}
            extra="JSON 格式，支持 ${deviceName}、${payload.xxx} 等占位符。"
          >
            <TextArea rows={12} placeholder={getTargetTemplate(watchedTargetType)} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default DataForwardRulePage;
