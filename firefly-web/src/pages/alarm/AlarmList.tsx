import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Modal, Form, Input, Select, Tabs, Row, Col, Badge } from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, ToolOutlined, CloseCircleOutlined,
  AlertOutlined, WarningOutlined, FireOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { alarmRuleApi, alarmRecordApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { TextArea } = Input;

// ==================== Types ====================
interface AlarmRuleRecord {
  id: number;
  name: string;
  description: string;
  productId: number;
  deviceId: number;
  level: string;
  conditionExpr: string;
  enabled: boolean;
  createdAt: string;
}

interface AlarmRecordItem {
  id: number;
  alarmRuleId: number;
  productId: number;
  deviceId: number;
  level: string;
  status: string;
  title: string;
  content: string;
  triggerValue: string;
  confirmedBy: number;
  confirmedAt: string;
  processedBy: number;
  processedAt: string;
  processRemark: string;
  createdAt: string;
}

const levelLabels: Record<string, string> = { CRITICAL: '紧急', WARNING: '警告', INFO: '通知' };
const levelColors: Record<string, string> = { CRITICAL: 'red', WARNING: 'orange', INFO: 'blue' };
const statusLabels: Record<string, string> = { TRIGGERED: '已触发', CONFIRMED: '已确认', PROCESSED: '已处理', CLOSED: '已关闭' };
const statusColors: Record<string, string> = { TRIGGERED: 'error', CONFIRMED: 'warning', PROCESSED: 'processing', CLOSED: 'default' };

/* ---------- Mini Stat Card ---------- */
const MiniStat: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string; bg: string }> = ({ title, value, icon, color, bg }) => (
  <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
      </div>
    </div>
  </Card>
);

// ==================== Alarm Rules Tab ====================
const AlarmRulesTab: React.FC = () => {
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRuleApi.list({ ...params, keyword: keyword || undefined, level: filterLevel });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载告警规则失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterLevel]);

  const ruleStats = useMemo(() => ({
    total: data.length,
    enabled: data.filter(d => d.enabled).length,
    disabled: data.filter(d => !d.enabled).length,
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await alarmRuleApi.create(values);
      message.success('告警规则创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch { message.error('创建失败'); }
  };

  const handleEdit = (record: AlarmRuleRecord) => {
    setEditingId(record.id);
    editForm.setFieldsValue({ name: record.name, description: record.description, level: record.level, conditionExpr: record.conditionExpr, enabled: record.enabled });
    setEditOpen(true);
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      await alarmRuleApi.update(editingId, values);
      message.success('更新成功');
      setEditOpen(false);
      editForm.resetFields();
      setEditingId(null);
      fetchData();
    } catch { message.error('更新失败'); }
  };

  const handleDelete = (record: AlarmRuleRecord) => {
    Modal.confirm({
      title: '确认删除告警规则？',
      content: `删除后不可恢复。确认删除「${record.name}」？`,
      onOk: async () => { await alarmRuleApi.delete(record.id); message.success('删除成功'); fetchData(); },
    });
  };

  const columns: ColumnsType<AlarmRuleRecord> = [
    { title: '规则名称', dataIndex: 'name', width: 200, ellipsis: true },
    { title: '级别', dataIndex: 'level', width: 80, render: (v: string) => <Tag color={levelColors[v]}>{levelLabels[v] || v}</Tag> },
    { title: '条件', dataIndex: 'conditionExpr', width: 280, ellipsis: true },
    { title: '状态', dataIndex: 'enabled', width: 80, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '禁用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 180, fixed: 'right',
      render: (_: unknown, record: AlarmRuleRecord) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  const ruleFormFields = (
    <>
      <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
        <Input placeholder="如：高温告警" maxLength={256} />
      </Form.Item>
      <Form.Item name="description" label="描述"><TextArea rows={2} /></Form.Item>
      <Form.Item name="level" label="告警级别" rules={[{ required: true, message: '请选择级别' }]}>
        <Select options={[{ value: 'CRITICAL', label: '紧急' }, { value: 'WARNING', label: '警告' }, { value: 'INFO', label: '通知' }]} />
      </Form.Item>
      <Form.Item name="conditionExpr" label="告警条件" rules={[{ required: true, message: '请输入告警条件' }]}>
        <TextArea rows={3} placeholder="payload.temperature > 50" style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Form.Item>
    </>
  );

  return (
    <>
      {/* Rule stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={8}><MiniStat title="规则总数" value={total} icon={<SafetyCertificateOutlined />} color="#4f46e5" bg="rgba(79,70,229,0.08)" /></Col>
        <Col xs={8}><MiniStat title="已启用" value={ruleStats.enabled} icon={<CheckCircleOutlined />} color="#10b981" bg="rgba(16,185,129,0.08)" /></Col>
        <Col xs={8}><MiniStat title="已禁用" value={ruleStats.disabled} icon={<CloseCircleOutlined />} color="#8c8c8c" bg="rgba(140,140,140,0.08)" /></Col>
      </Row>

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search placeholder="搜索规则名称" allowClear style={{ width: 220 }}
            onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
          <Select placeholder="级别" allowClear style={{ width: 120 }}
            options={[{ value: 'CRITICAL', label: '紧急' }, { value: 'WARNING', label: '警告' }, { value: 'INFO', label: '通知' }]}
            onChange={(v) => { setFilterLevel(v); setParams({ ...params, pageNum: 1 }); }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建规则</Button>
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1000 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="新建告警规则" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose width={560}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>{ruleFormFields}</Form>
      </Modal>
      <Modal title="编辑告警规则" open={editOpen} onCancel={() => { setEditOpen(false); setEditingId(null); }} onOk={() => editForm.submit()} destroyOnClose width={560}>
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          {ruleFormFields}
          <Form.Item name="enabled" label="是否启用">
            <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ==================== Alarm Records Tab ====================
const AlarmRecordsTab: React.FC = () => {
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRecordApi.list({ ...params, keyword: keyword || undefined, level: filterLevel, status: filterStatus });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载告警记录失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterLevel, filterStatus]);

  const recordStats = useMemo(() => ({
    triggered: data.filter(d => d.status === 'TRIGGERED').length,
    confirmed: data.filter(d => d.status === 'CONFIRMED').length,
    processed: data.filter(d => d.status === 'PROCESSED').length,
    closed: data.filter(d => d.status === 'CLOSED').length,
    critical: data.filter(d => d.level === 'CRITICAL').length,
  }), [data]);

  const handleConfirm = async (id: number) => {
    try { await alarmRecordApi.confirm(id); message.success('已确认'); fetchData(); } catch { message.error('操作失败'); }
  };

  const handleProcess = (id: number) => { setProcessingId(id); setProcessOpen(true); };

  const handleProcessSubmit = async (values: Record<string, unknown>) => {
    if (!processingId) return;
    try {
      await alarmRecordApi.process(processingId, values);
      message.success('已处理');
      setProcessOpen(false);
      processForm.resetFields();
      setProcessingId(null);
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleClose = async (id: number) => {
    try { await alarmRecordApi.close(id); message.success('已关闭'); fetchData(); } catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<AlarmRecordItem> = [
    { title: '告警标题', dataIndex: 'title', width: 220, ellipsis: true },
    { title: '级别', dataIndex: 'level', width: 80, render: (v: string) => <Tag color={levelColors[v]}>{levelLabels[v] || v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: '触发值', dataIndex: 'triggerValue', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: '触发时间', dataIndex: 'createdAt', width: 170 },
    { title: '处理备注', dataIndex: 'processRemark', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_: unknown, record: AlarmRecordItem) => (
        <Space>
          {record.status === 'TRIGGERED' && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleConfirm(record.id)}>确认</Button>
          )}
          {(record.status === 'TRIGGERED' || record.status === 'CONFIRMED') && (
            <Button type="link" size="small" icon={<ToolOutlined />} onClick={() => handleProcess(record.id)}>处理</Button>
          )}
          {record.status !== 'CLOSED' && (
            <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={() => handleClose(record.id)}>关闭</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* Record stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '待处理', value: recordStats.triggered, icon: <FireOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
          { title: '已确认', value: recordStats.confirmed, icon: <WarningOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { title: '已处理', value: recordStats.processed, icon: <ToolOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '已关闭', value: recordStats.closed, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}><MiniStat {...s} /></Col>
        ))}
      </Row>

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search placeholder="搜索告警标题" allowClear style={{ width: 220 }}
            onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
          <Select placeholder="级别" allowClear style={{ width: 120 }}
            options={[{ value: 'CRITICAL', label: '紧急' }, { value: 'WARNING', label: '警告' }, { value: 'INFO', label: '通知' }]}
            onChange={(v) => { setFilterLevel(v); setParams({ ...params, pageNum: 1 }); }} />
          <Select placeholder="状态" allowClear style={{ width: 120 }}
            options={[{ value: 'TRIGGERED', label: '已触发' }, { value: 'CONFIRMED', label: '已确认' }, { value: 'PROCESSED', label: '已处理' }, { value: 'CLOSED', label: '已关闭' }]}
            onChange={(v) => { setFilterStatus(v); setParams({ ...params, pageNum: 1 }); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1200 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="处理告警" open={processOpen} onCancel={() => { setProcessOpen(false); setProcessingId(null); }}
        onOk={() => processForm.submit()} destroyOnClose width={480}>
        <Form form={processForm} layout="vertical" onFinish={handleProcessSubmit}>
          <Form.Item name="processRemark" label="处理备注"><TextArea rows={3} placeholder="请输入处理说明" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ==================== Main Component ====================
const AlarmList: React.FC = () => {
  return (
    <div>
      <PageHeader title="告警管理" description="管理告警规则与告警记录" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="records" items={[
          { key: 'records', label: <span><Badge dot offset={[6, 0]}><AlertOutlined style={{ marginRight: 6 }} /></Badge>告警记录</span>, children: <AlarmRecordsTab /> },
          { key: 'rules', label: <span><SafetyCertificateOutlined style={{ marginRight: 6 }} />告警规则</span>, children: <AlarmRulesTab /> },
        ]} />
      </Card>
    </div>
  );
};

export default AlarmList;
