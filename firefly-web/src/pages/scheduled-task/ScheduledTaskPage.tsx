import React, { useEffect, useState } from 'react';
import {
  Table, Button, Space, message, Tag, Popconfirm, Card, Form, Input, Select,
  Switch, Drawer, Tooltip, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  PlayCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, HistoryOutlined, ClearOutlined,
  PauseCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { scheduledTaskApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

interface TaskItem {
  id: number;
  taskName: string;
  taskGroup: string;
  cronExpression: string;
  beanName: string;
  methodName: string;
  methodParams: string | null;
  status: number;
  description: string | null;
  misfirePolicy: number;
  lastExecTime: string | null;
  lastExecStatus: string | null;
  lastExecMessage: string | null;
  createdAt: string;
}

interface LogItem {
  id: number;
  taskId: number;
  taskName: string;
  taskGroup: string;
  beanName: string;
  methodName: string;
  methodParams: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

interface ScheduledTaskFilters {
  status?: number;
}

const ScheduledTaskPage: React.FC = () => {
  const [data, setData] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<ScheduledTaskFilters>({});
  const [filters, setFilters] = useState<ScheduledTaskFilters>({});

  // CRUD modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Log drawer
  const [logOpen, setLogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState<number | null>(null);
  const [logTaskName, setLogTaskName] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logTotal, setLogTotal] = useState(0);
  const [logParams, setLogParams] = useState({ pageNum: 1, pageSize: 15 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await scheduledTaskApi.list({ ...params, status: filters.status });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({ status: draftFilters.status });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const fetchLogs = async (taskId: number) => {
    setLogLoading(true);
    try {
      const res = await scheduledTaskApi.listLogs({ ...logParams, taskId });
      const page = res.data.data;
      setLogs(page.records || []);
      setLogTotal(page.total || 0);
    } catch { setLogs([]); } finally { setLogLoading(false); }
  };

  useEffect(() => {
    if (logOpen && logTaskId) fetchLogs(logTaskId);
  }, [logOpen, logTaskId, logParams.pageNum]);

  // ==================== Handlers ====================

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ taskGroup: 'DEFAULT', status: 1, misfirePolicy: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: TaskItem) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingId) {
        await scheduledTaskApi.update(editingId, values);
        message.success('更新成功');
      } else {
        await scheduledTaskApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchData();
    } catch { message.error('操作失败'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    await scheduledTaskApi.delete(id);
    message.success('已删除');
    fetchData();
  };

  const handleToggle = async (record: TaskItem, checked: boolean) => {
    try {
      if (checked) {
        await scheduledTaskApi.enable(record.id);
        message.success('已启用');
      } else {
        await scheduledTaskApi.disable(record.id);
        message.success('已停用');
      }
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleExecute = async (id: number) => {
    await scheduledTaskApi.executeOnce(id);
    message.success('已触发执行');
    setTimeout(fetchData, 1500);
  };

  const openLog = (record: TaskItem) => {
    setLogTaskId(record.id);
    setLogTaskName(record.taskName);
    setLogParams({ pageNum: 1, pageSize: 15 });
    setLogOpen(true);
  };

  const handleCleanLogs = async () => {
    const res = await scheduledTaskApi.cleanLogs(30);
    message.success(`已清理 ${res.data.data} 条日志`);
    if (logTaskId) fetchLogs(logTaskId);
  };

  // ==================== Columns ====================

  const columns: ColumnsType<TaskItem> = [
    { title: '任务名称', dataIndex: 'taskName', width: 180 },
    { title: '分组', dataIndex: 'taskGroup', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Cron 表达式', dataIndex: 'cronExpression', width: 150,
      render: (v: string) => <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code> },
    { title: 'Bean.Method', width: 200,
      render: (_: unknown, r: TaskItem) => (
        <Tooltip title={r.methodParams || '无参数'}>
          <code style={{ fontSize: 12 }}>{r.beanName}.{r.methodName}()</code>
        </Tooltip>
      ) },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center',
      render: (v: number, record: TaskItem) => (
        <Switch size="small" checked={v === 1} onChange={(c) => handleToggle(record, c)} />
      ),
    },
    {
      title: '上次执行', width: 190,
      render: (_: unknown, r: TaskItem) => r.lastExecTime ? (
        <Space size={4}>
          {r.lastExecStatus === 'SUCCESS'
            ? <CheckCircleOutlined style={{ color: '#10b981' }} />
            : <CloseCircleOutlined style={{ color: '#ef4444' }} />}
          <span style={{ fontSize: 12, color: '#64748b' }}>{r.lastExecTime}</span>
        </Space>
      ) : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    { title: '描述', dataIndex: 'description', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_: unknown, record: TaskItem) => (
        <Space size="small">
          <Tooltip title="执行一次">
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleExecute(record.id)} />
          </Tooltip>
          <Tooltip title="执行日志">
            <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openLog(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="确认删除该定时任务？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const logColumns: ColumnsType<LogItem> = [
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => v === 'SUCCESS'
        ? <Tag color="success">成功</Tag>
        : <Tag color="error">失败</Tag>,
    },
    { title: '开始时间', dataIndex: 'startTime', width: 170 },
    { title: '耗时', dataIndex: 'durationMs', width: 90,
      render: (v: number | null) => v != null ? `${v} ms` : '-' },
    { title: '错误信息', dataIndex: 'errorMessage', ellipsis: true, render: (v: string) => v || '-' },
  ];

  // ==================== Stats ====================
  const enabledCount = data.filter((d) => d.status === 1).length;
  const disabledCount = data.filter((d) => d.status === 0).length;

  return (
    <div>
      <PageHeader
        title="定时任务管理"
        description={`共 ${total} 个定时任务`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button>
          </Space>
        }
      />

      {/* Stat cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '任务总数', value: total, icon: <ThunderboltOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '运行中', value: enabledCount, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '已停用', value: disabledCount, icon: <PauseCircleOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        ].map((s, i) => (
          <Col xs={8} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: s.color }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{s.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filter */}
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Select
            className="ff-query-field"
            placeholder="任务状态"
            allowClear
            style={{ width: 130 }}
            value={draftFilters.status}
            onChange={(value) => { setDraftFilters({ status: value }); }}
            options={[{ value: 1, label: '运行中' }, { value: 0, label: '已停用' }]}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1400 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      {/* CRUD Drawer */}
      <Drawer
        title={editingId ? '??????' : '??????'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        width={760}
        destroyOnClose
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setModalOpen(false)}>??</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {editingId ? '????' : '??????'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="????" name="taskName" rules={[{ required: true, message: '???????' }]}>
                <Input placeholder="????????" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="????" name="taskGroup">
                <Input placeholder="DEFAULT" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="Cron ???"
            name="cronExpression"
            rules={[{ required: true, message: '??? Cron ???' }]}
            extra={<span style={{ fontSize: 11, color: '#8c8c8c' }}>???0 0 2 * * ? / 0 */5 * * * ?</span>}
          >
            <Input placeholder="0 0 2 * * ?" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Bean ??" name="beanName" rules={[{ required: true, message: '??? Bean ??' }]}>
                <Input placeholder="Spring Bean ??" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="???" name="methodName" rules={[{ required: true, message: '??????' }]}>
                <Input placeholder="?????" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="???? (JSON)" name="methodParams">
            <Input.TextArea rows={2} placeholder='?????{"key":"value"}' style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="??" name="status">
                <Select options={[{ value: 1, label: '??' }, { value: 0, label: '??' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="????" name="misfirePolicy">
                <Select options={[{ value: 0, label: '??' }, { value: 1, label: '??????' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="??" name="description">
            <Input.TextArea rows={2} placeholder="????..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Log Drawer */}
      <Drawer title={<Space><HistoryOutlined /> {logTaskName} - 执行日志</Space>}
        open={logOpen} onClose={() => setLogOpen(false)} width={640}
        extra={
          <Popconfirm title="清理30天前的日志？" onConfirm={handleCleanLogs}>
            <Button size="small" icon={<ClearOutlined />} danger>清理</Button>
          </Popconfirm>
        }>
        <Table rowKey="id" columns={logColumns} dataSource={logs} loading={logLoading} size="small"
          pagination={{ current: logParams.pageNum, pageSize: logParams.pageSize, total: logTotal, showSizeChanger: false,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number) => setLogParams({ ...logParams, pageNum: page }) }} />
      </Drawer>
    </div>
  );
};

export default ScheduledTaskPage;
