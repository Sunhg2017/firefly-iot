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
import { ALARM_LEVEL_LABELS, ALARM_STATUS_LABELS, ALARM_TEXT } from './alarmText';

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
      message.error(ALARM_TEXT.loadRuleError);
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
      message.success(ALARM_TEXT.createRuleSuccess);
      setCreateOpen(false);
      createForm.resetFields();
      await fetchData();
    } catch {
      message.error(ALARM_TEXT.createRuleError);
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
      message.success(ALARM_TEXT.updateRuleSuccess);
      setEditOpen(false);
      setEditingId(null);
      editForm.resetFields();
      await fetchData();
    } catch {
      message.error(ALARM_TEXT.updateRuleError);
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

  const columns: ColumnsType<AlarmRuleRecord> = [
    { title: ALARM_TEXT.ruleName, dataIndex: 'name', width: 220, ellipsis: true },
    {
      title: ALARM_TEXT.level,
      dataIndex: 'level',
      width: 100,
      render: (value: string) => (
        <Tag color={levelColors[value]}>{ALARM_LEVEL_LABELS[value] || value}</Tag>
      ),
    },
    { title: ALARM_TEXT.condition, dataIndex: 'conditionExpr', width: 320, ellipsis: true },
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

  const ruleFormFields = (
    <>
      <Form.Item
        name="name"
        label={ALARM_TEXT.ruleName}
        rules={[{ required: true, message: ALARM_TEXT.ruleNameRequired }]}
      >
        <Input placeholder={ALARM_TEXT.ruleNamePlaceholder} maxLength={256} />
      </Form.Item>
      <Form.Item name="description" label={ALARM_TEXT.description}>
        <TextArea rows={2} placeholder={ALARM_TEXT.descriptionPlaceholder} />
      </Form.Item>
      <Form.Item
        name="level"
        label={ALARM_TEXT.levelPlaceholder}
        rules={[{ required: true, message: ALARM_TEXT.levelRequired }]}
      >
        <Select
          options={[
            { value: 'CRITICAL', label: ALARM_LEVEL_LABELS.CRITICAL },
            { value: 'WARNING', label: ALARM_LEVEL_LABELS.WARNING },
            { value: 'INFO', label: ALARM_LEVEL_LABELS.INFO },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="conditionExpr"
        label={ALARM_TEXT.condition}
        rules={[{ required: true, message: ALARM_TEXT.conditionRequired }]}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {ALARM_TEXT.createRule}
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
            showTotal: (count: number) => `\u5171 ${count} ${ALARM_TEXT.countSuffix}`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal
        title={ALARM_TEXT.createRuleTitle}
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
        title={ALARM_TEXT.editRuleTitle}
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
          <Form.Item name="enabled" label={ALARM_TEXT.status}>
            <Select
              options={[
                { value: true, label: ALARM_TEXT.enabled },
                { value: false, label: ALARM_TEXT.disabled },
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
