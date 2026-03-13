import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
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
import { alarmRecordApi, alarmRuleApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

const { TextArea } = Input;

interface AlarmRuleRecord {
  id: number;
  name: string;
  description?: string;
  productId?: number;
  deviceId?: number;
  level: string;
  conditionExpr: string;
  enabled: boolean;
  createdAt: string;
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

const TEXT = {
  ruleName: '\u89c4\u5219\u540d\u79f0',
  level: '\u7ea7\u522b',
  condition: '\u89e6\u53d1\u6761\u4ef6',
  status: '\u72b6\u6001',
  createdAt: '\u521b\u5efa\u65f6\u95f4',
  action: '\u64cd\u4f5c',
  description: '\u89c4\u5219\u8bf4\u660e',
  levelPlaceholder: '\u544a\u8b66\u7ea7\u522b',
  searchRule: '\u641c\u7d22\u89c4\u5219\u540d\u79f0',
  searchRecord: '\u641c\u7d22\u544a\u8b66\u6807\u9898',
  processStatus: '\u5904\u7406\u72b6\u6001',
  triggerValue: '\u89e6\u53d1\u503c',
  processRemark: '\u5904\u7406\u5907\u6ce8',
  title: '\u544a\u8b66\u6807\u9898',
  close: '\u5173\u95ed',
  confirm: '\u786e\u8ba4',
  process: '\u5904\u7406',
  edit: '\u7f16\u8f91',
  remove: '\u5220\u9664',
  createRule: '\u65b0\u5efa\u89c4\u5219',
  createRuleTitle: '\u65b0\u5efa\u544a\u8b66\u89c4\u5219',
  editRuleTitle: '\u7f16\u8f91\u544a\u8b66\u89c4\u5219',
  processTitle: '\u5904\u7406\u544a\u8b66',
  totalRules: '\u89c4\u5219\u603b\u6570',
  enabledRules: '\u5df2\u542f\u7528',
  disabledRules: '\u5df2\u505c\u7528',
  triggered: '\u5f85\u786e\u8ba4',
  confirmed: '\u5df2\u786e\u8ba4',
  processed: '\u5df2\u5904\u7406',
  closed: '\u5df2\u5173\u95ed',
  enabled: '\u542f\u7528',
  disabled: '\u505c\u7528',
  badge: '\u544a\u8b66\u5904\u7406',
};

const levelLabels: Record<string, string> = {
  CRITICAL: '\u7d27\u6025',
  WARNING: '\u544a\u8b66',
  INFO: '\u901a\u77e5',
};

const levelColors: Record<string, string> = {
  CRITICAL: 'red',
  WARNING: 'orange',
  INFO: 'blue',
};

const statusLabels: Record<string, string> = {
  TRIGGERED: TEXT.triggered,
  CONFIRMED: TEXT.confirmed,
  PROCESSED: TEXT.processed,
  CLOSED: TEXT.closed,
};

const statusColors: Record<string, string> = {
  TRIGGERED: 'error',
  CONFIRMED: 'warning',
  PROCESSED: 'processing',
  CLOSED: 'default',
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

  const canCreate = hasPermission('alarm:create');
  const canUpdate = hasPermission('alarm:update');
  const canDelete = hasPermission('alarm:delete');

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
      message.error('\u52a0\u8f7d\u544a\u8b66\u89c4\u5219\u5931\u8d25');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, filterLevel, keyword]);

  const ruleStats = useMemo(
    () => ({
      total,
      enabled: data.filter((item) => item.enabled).length,
      disabled: data.filter((item) => !item.enabled).length,
    }),
    [data, total],
  );

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await alarmRuleApi.create(values);
      message.success('\u544a\u8b66\u89c4\u5219\u521b\u5efa\u6210\u529f');
      setCreateOpen(false);
      createForm.resetFields();
      await fetchData();
    } catch {
      message.error('\u521b\u5efa\u544a\u8b66\u89c4\u5219\u5931\u8d25');
    }
  };

  const handleEdit = (record: AlarmRuleRecord) => {
    setEditingId(record.id);
    editForm.setFieldsValue({
      name: record.name,
      description: record.description,
      level: record.level,
      conditionExpr: record.conditionExpr,
      enabled: record.enabled,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editingId) {
      return;
    }
    try {
      await alarmRuleApi.update(editingId, values);
      message.success('\u544a\u8b66\u89c4\u5219\u66f4\u65b0\u6210\u529f');
      setEditOpen(false);
      setEditingId(null);
      editForm.resetFields();
      await fetchData();
    } catch {
      message.error('\u66f4\u65b0\u544a\u8b66\u89c4\u5219\u5931\u8d25');
    }
  };

  const handleDelete = (record: AlarmRuleRecord) => {
    Modal.confirm({
      title: '\u786e\u8ba4\u5220\u9664\u544a\u8b66\u89c4\u5219',
      content: `\u5220\u9664\u540e\u4e0d\u53ef\u6062\u590d\uff0c\u786e\u8ba4\u5220\u9664\u201c${record.name}\u201d\u5417\uff1f`,
      onOk: async () => {
        try {
          await alarmRuleApi.delete(record.id);
          message.success('\u544a\u8b66\u89c4\u5219\u5df2\u5220\u9664');
          await fetchData();
        } catch {
          message.error('\u5220\u9664\u544a\u8b66\u89c4\u5219\u5931\u8d25');
        }
      },
    });
  };

  const columns: ColumnsType<AlarmRuleRecord> = [
    { title: TEXT.ruleName, dataIndex: 'name', width: 220, ellipsis: true },
    {
      title: TEXT.level,
      dataIndex: 'level',
      width: 100,
      render: (value: string) => <Tag color={levelColors[value]}>{levelLabels[value] || value}</Tag>,
    },
    { title: TEXT.condition, dataIndex: 'conditionExpr', width: 320, ellipsis: true },
    {
      title: TEXT.status,
      dataIndex: 'enabled',
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? 'success' : 'default'}>{value ? TEXT.enabled : TEXT.disabled}</Tag>
      ),
    },
    { title: TEXT.createdAt, dataIndex: 'createdAt', width: 180 },
    {
      title: TEXT.action,
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
                {TEXT.edit}
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
                {TEXT.remove}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const ruleFormFields = (
    <>
      <Form.Item
        name="name"
        label={TEXT.ruleName}
        rules={[{ required: true, message: '\u8bf7\u8f93\u5165\u89c4\u5219\u540d\u79f0' }]}
      >
        <Input placeholder="\u4f8b\u5982\uff1a\u9ad8\u6e29\u544a\u8b66" maxLength={256} />
      </Form.Item>
      <Form.Item name="description" label={TEXT.description}>
        <TextArea rows={2} placeholder="\u8865\u5145\u9002\u7528\u8303\u56f4\u3001\u89e6\u53d1\u80cc\u666f\u6216\u503c\u73ed\u8bf4\u660e" />
      </Form.Item>
      <Form.Item
        name="level"
        label={TEXT.levelPlaceholder}
        rules={[{ required: true, message: '\u8bf7\u9009\u62e9\u544a\u8b66\u7ea7\u522b' }]}
      >
        <Select
          options={[
            { value: 'CRITICAL', label: levelLabels.CRITICAL },
            { value: 'WARNING', label: levelLabels.WARNING },
            { value: 'INFO', label: levelLabels.INFO },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="conditionExpr"
        label={TEXT.condition}
        rules={[{ required: true, message: '\u8bf7\u8f93\u5165\u89e6\u53d1\u6761\u4ef6\u8868\u8fbe\u5f0f' }]}
      >
        <TextArea
          rows={3}
          placeholder="payload.temperature > 50"
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Form.Item>
    </>
  );

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <MiniStat
            title={TEXT.totalRules}
            value={ruleStats.total}
            icon={<SafetyCertificateOutlined />}
            color="#4f46e5"
            bg="rgba(79,70,229,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={TEXT.enabledRules}
            value={ruleStats.enabled}
            icon={<CheckCircleOutlined />}
            color="#10b981"
            bg="rgba(16,185,129,0.08)"
          />
        </Col>
        <Col xs={8}>
          <MiniStat
            title={TEXT.disabledRules}
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
            placeholder={TEXT.searchRule}
            allowClear
            style={{ width: 220 }}
            onSearch={(value) => {
              setKeyword(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
            placeholder={TEXT.levelPlaceholder}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'CRITICAL', label: levelLabels.CRITICAL },
              { value: 'WARNING', label: levelLabels.WARNING },
              { value: 'INFO', label: levelLabels.INFO },
            ]}
            onChange={(value) => {
              setFilterLevel(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {TEXT.createRule}
            </Button>
          )}
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `\u5171 ${count} \u6761`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal
        title={TEXT.createRuleTitle}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        destroyOnClose
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          {ruleFormFields}
        </Form>
      </Modal>

      <Modal
        title={TEXT.editRuleTitle}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingId(null);
        }}
        onOk={() => editForm.submit()}
        destroyOnClose
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          {ruleFormFields}
          <Form.Item name="enabled" label={TEXT.status}>
            <Select
              options={[
                { value: true, label: TEXT.enabled },
                { value: false, label: TEXT.disabled },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
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
      message.error('\u52a0\u8f7d\u544a\u8b66\u8bb0\u5f55\u5931\u8d25');
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
      message.success('\u544a\u8b66\u5df2\u786e\u8ba4');
      await fetchData();
    } catch {
      message.error('\u786e\u8ba4\u544a\u8b66\u5931\u8d25');
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
      message.success('\u544a\u8b66\u5df2\u5904\u7406');
      setProcessOpen(false);
      setProcessingId(null);
      processForm.resetFields();
      await fetchData();
    } catch {
      message.error('\u5904\u7406\u544a\u8b66\u5931\u8d25');
    }
  };

  const handleClose = async (id: number) => {
    try {
      await alarmRecordApi.close(id);
      message.success('\u544a\u8b66\u5df2\u5173\u95ed');
      await fetchData();
    } catch {
      message.error('\u5173\u95ed\u544a\u8b66\u5931\u8d25');
    }
  };

  const columns: ColumnsType<AlarmRecordItem> = [
    { title: TEXT.title, dataIndex: 'title', width: 240, ellipsis: true },
    {
      title: TEXT.level,
      dataIndex: 'level',
      width: 100,
      render: (value: string) => <Tag color={levelColors[value]}>{levelLabels[value] || value}</Tag>,
    },
    {
      title: TEXT.status,
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag>,
    },
    {
      title: TEXT.triggerValue,
      dataIndex: 'triggerValue',
      width: 160,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    { title: '\u89e6\u53d1\u65f6\u95f4', dataIndex: 'createdAt', width: 180 },
    {
      title: TEXT.processRemark,
      dataIndex: 'processRemark',
      width: 220,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: TEXT.action,
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
              {TEXT.confirm}
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
              {TEXT.process}
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
              {TEXT.close}
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
            title: TEXT.triggered,
            value: recordStats.triggered,
            icon: <FireOutlined />,
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.08)',
          },
          {
            key: 'confirmed',
            title: TEXT.confirmed,
            value: recordStats.confirmed,
            icon: <WarningOutlined />,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
          },
          {
            key: 'processed',
            title: TEXT.processed,
            value: recordStats.processed,
            icon: <ToolOutlined />,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
          },
          {
            key: 'closed',
            title: TEXT.closed,
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
            placeholder={TEXT.searchRecord}
            allowClear
            style={{ width: 220 }}
            onSearch={(value) => {
              setKeyword(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
            placeholder={TEXT.levelPlaceholder}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'CRITICAL', label: levelLabels.CRITICAL },
              { value: 'WARNING', label: levelLabels.WARNING },
              { value: 'INFO', label: levelLabels.INFO },
            ]}
            onChange={(value) => {
              setFilterLevel(value);
              setParams((current) => ({ ...current, pageNum: 1 }));
            }}
          />
          <Select
            placeholder={TEXT.processStatus}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'TRIGGERED', label: TEXT.triggered },
              { value: 'CONFIRMED', label: TEXT.confirmed },
              { value: 'PROCESSED', label: TEXT.processed },
              { value: 'CLOSED', label: TEXT.closed },
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
            showTotal: (count: number) => `\u5171 ${count} \u6761`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal
        title={TEXT.processTitle}
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
          <Form.Item name="processRemark" label={TEXT.processRemark}>
            <TextArea rows={3} placeholder="\u8bf7\u8f93\u5165\u5904\u7406\u8bf4\u660e\u3001\u5de5\u5355\u53f7\u6216\u503c\u73ed\u8bb0\u5f55" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export const AlarmPageBadge: React.FC = () => (
  <Badge dot offset={[6, 0]}>
    <AlertOutlined style={{ marginRight: 6 }} />
    {TEXT.badge}
  </Badge>
);
