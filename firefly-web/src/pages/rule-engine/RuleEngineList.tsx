import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Modal, Form, Input, Select, Typography, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined, ThunderboltOutlined, CheckCircleOutlined, StopOutlined, FunctionOutlined } from '@ant-design/icons';
import { ruleApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { Paragraph } = Typography;
const { TextArea } = Input;

interface RuleRecord {
  id: number;
  name: string;
  description: string;
  sqlExpr: string;
  status: string;
  triggerCount: number;
  successCount: number;
  errorCount: number;
  lastTriggerAt: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = { ENABLED: '运行中', DISABLED: '已停用' };
const statusColors: Record<string, string> = { ENABLED: 'success', DISABLED: 'default' };

const actionTypeLabels: Record<string, string> = {
  DB_WRITE: '数据存储', KAFKA_FORWARD: '消息转发', WEBHOOK: 'Webhook',
  EMAIL: '邮件通知', SMS: '短信通知', DEVICE_COMMAND: '设备联动',
};
const actionTypeOptions = Object.entries(actionTypeLabels).map(([value, label]) => ({ value, label }));

const RuleEngineList: React.FC = () => {
  const [data, setData] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ruleApi.list({
        ...params,
        keyword: keyword || undefined,
        status: filterStatus,
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

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterStatus]);

  const stats = useMemo(() => ({
    total: data.length,
    enabled: data.filter(d => d.status === 'ENABLED').length,
    disabled: data.filter(d => d.status === 'DISABLED').length,
    totalTriggers: data.reduce((s, d) => s + (d.triggerCount || 0), 0),
    totalErrors: data.reduce((s, d) => s + (d.errorCount || 0), 0),
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      const actions = values.actions || [];
      await ruleApi.create({ ...values, actions });
      message.success('规则创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch {
      message.error('创建失败');
    }
  };

  const handleEdit = async (record: RuleRecord) => {
    setEditingId(record.id);
    try {
      const res = await ruleApi.get(record.id);
      const detail = res.data.data;
      editForm.setFieldsValue({
        name: detail.name,
        description: detail.description,
        sqlExpr: detail.sqlExpr,
        actions: detail.actions || [],
      });
    } catch {
      editForm.setFieldsValue({ name: record.name, description: record.description, sqlExpr: record.sqlExpr });
    }
    setEditOpen(true);
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      await ruleApi.update(editingId, values);
      message.success('更新成功');
      setEditOpen(false);
      editForm.resetFields();
      setEditingId(null);
      fetchData();
    } catch {
      message.error('更新失败');
    }
  };

  const handleToggle = async (record: RuleRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await ruleApi.disable(record.id);
        message.success('已停用');
      } else {
        await ruleApi.enable(record.id);
        message.success('已启用');
      }
      fetchData();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = (record: RuleRecord) => {
    Modal.confirm({
      title: '确认删除规则？',
      content: `删除后不可恢复。确认删除「${record.name}」？`,
      onOk: async () => {
        await ruleApi.delete(record.id);
        message.success('删除成功');
        fetchData();
      },
    });
  };

  const columns: ColumnsType<RuleRecord> = [
    { title: '规则名称', dataIndex: 'name', width: 200, ellipsis: true },
    {
      title: 'SQL 表达式', dataIndex: 'sqlExpr', width: 280, ellipsis: true,
      render: (v: string) => <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 0, fontSize: 12 }}>{v}</Paragraph>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>,
    },
    { title: '触发', dataIndex: 'triggerCount', width: 70, align: 'center' },
    {
      title: '成功/失败', width: 110, align: 'center',
      render: (_: unknown, record: RuleRecord) => (
        <span><span style={{ color: '#52c41a' }}>{record.successCount}</span> / <span style={{ color: '#ff4d4f' }}>{record.errorCount}</span></span>
      ),
    },
    { title: '最近触发', dataIndex: 'lastTriggerAt', width: 170, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 220, fixed: 'right',
      render: (_: unknown, record: RuleRecord) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small"
            icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => handleToggle(record)}>
            {record.status === 'ENABLED' ? '停用' : '启用'}
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}
            disabled={record.status === 'ENABLED'} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="规则引擎"
        description={`共 ${total} 条规则，${stats.enabled} 条运行中，累计触发 ${stats.totalTriggers} 次`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建规则</Button>}
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '规则总数', value: total, icon: <FunctionOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '运行中', value: stats.enabled, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '已停用', value: stats.disabled, icon: <StopOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: '累计触发', value: stats.totalTriggers, icon: <ThunderboltOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
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

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search placeholder="搜索规则名称" allowClear style={{ width: 220 }}
            onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
          <Select placeholder="状态" allowClear style={{ width: 120 }}
            options={[{ value: 'ENABLED', label: '运行中' }, { value: 'DISABLED', label: '已停用' }]}
            onChange={(v) => { setFilterStatus(v); setParams({ ...params, pageNum: 1 }); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1300 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      {/* 新建规则弹窗 */}
      <Modal title="新建规则" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()} destroyOnClose width={700}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如：高温告警" maxLength={256} />
          </Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={2} /></Form.Item>
          <Form.Item name="sqlExpr" label="SQL 表达式" rules={[{ required: true, message: '请输入SQL表达式' }]}>
            <TextArea rows={4} placeholder="SELECT deviceName, payload.temperature AS temp FROM 'topic' WHERE payload.temperature > 50"
              style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </Form.Item>
          <Form.List name="actions">
            {(fields, { add, remove }) => (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>动作列表</div>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...restField} name={[name, 'actionType']} rules={[{ required: true, message: '请选择类型' }]}>
                      <Select style={{ width: 140 }} placeholder="动作类型" options={actionTypeOptions} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'actionConfig']}>
                      <Input style={{ width: 320 }} placeholder='配置 JSON，如 {"url":"https://..."}' />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加动作</Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* 编辑规则弹窗 */}
      <Modal title="编辑规则" open={editOpen} onCancel={() => { setEditOpen(false); setEditingId(null); }}
        onOk={() => editForm.submit()} destroyOnClose width={700}>
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}><Input maxLength={256} /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={2} /></Form.Item>
          <Form.Item name="sqlExpr" label="SQL 表达式" rules={[{ required: true }]}>
            <TextArea rows={4} style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </Form.Item>
          <Form.List name="actions">
            {(fields, { add, remove }) => (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>动作列表</div>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...restField} name={[name, 'actionType']} rules={[{ required: true }]}>
                      <Select style={{ width: 140 }} placeholder="动作类型" options={actionTypeOptions} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'actionConfig']}>
                      <Input style={{ width: 320 }} placeholder='配置 JSON' />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加动作</Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default RuleEngineList;
