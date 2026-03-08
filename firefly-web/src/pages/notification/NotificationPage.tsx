import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Table, Button, Space, message, Modal, Form, Input, Select, Switch, Tag, Descriptions, Card, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, EyeOutlined, BellOutlined, MailOutlined, CheckCircleOutlined, CloseCircleOutlined, SendOutlined } from '@ant-design/icons';
import { notificationChannelApi, notificationRecordApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


// ==================== Types ====================

interface ChannelItem {
  id: number;
  name: string;
  type: string;
  config: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RecordItem {
  id: number;
  channelId: number;
  channelType: string;
  templateCode: string;
  subject: string;
  content: string;
  recipient: string;
  status: string;
  errorMessage: string;
  retryCount: number;
  sentAt: string;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  EMAIL: '邮件', SMS: '短信', WEBHOOK: 'Webhook', DINGTALK: '钉钉', WECHAT: '企业微信',
};

const typeColors: Record<string, string> = {
  EMAIL: 'blue', SMS: 'green', WEBHOOK: 'purple', DINGTALK: 'orange', WECHAT: 'cyan',
};

// ==================== Channel Tab ====================

const ChannelTab: React.FC = () => {
  const [data, setData] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ChannelItem | null>(null);
  const [form] = Form.useForm();
  const [channelType, setChannelType] = useState('EMAIL');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationChannelApi.list();
      setData(res.data.data || []);
    } catch { message.error('加载渠道失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (record: ChannelItem | null) => {
    setEditRecord(record);
    if (record) {
      let configObj = {};
      try { configObj = JSON.parse(record.config || '{}'); } catch {}
      form.setFieldsValue({ name: record.name, type: record.type, enabled: record.enabled, ...configObj });
      setChannelType(record.type);
    } else {
      form.resetFields();
      setChannelType('EMAIL');
    }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    const { name, type, enabled, ...configFields } = values;
    const payload = { name, type, enabled, config: JSON.stringify(configFields) };
    try {
      if (editRecord) {
        await notificationChannelApi.update(editRecord.id, payload);
        message.success('更新成功');
      } else {
        await notificationChannelApi.create(payload);
        message.success('创建成功');
      }
      setEditOpen(false);
      fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = (record: ChannelItem) => {
    Modal.confirm({
      title: '确认删除渠道？', content: `删除「${record.name}」？`,
      onOk: async () => { await notificationChannelApi.delete(record.id); message.success('删除成功'); fetchData(); },
    });
  };

  const handleToggle = async (record: ChannelItem, enabled: boolean) => {
    await notificationChannelApi.toggle(record.id, enabled);
    message.success(enabled ? '已启用' : '已禁用');
    fetchData();
  };

  const handleTest = async (record: ChannelItem) => {
    try {
      const res = await notificationChannelApi.test(record.id);
      message.info(res.data.data || '测试完成');
    } catch { message.error('测试失败'); }
  };

  const columns: ColumnsType<ChannelItem> = [
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color={typeColors[v]}>{typeLabels[v] || v}</Tag> },
    { title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: boolean, record: ChannelItem) => <Switch checked={v} size="small" onChange={(c: boolean) => handleToggle(record, c)} /> },
    { title: '更新时间', dataIndex: 'updatedAt', width: 170 },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_: unknown, record: ChannelItem) => (
        <Space>
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(record)}>测试</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  const channelStats = useMemo(() => ({
    total: data.length,
    enabled: data.filter(d => d.enabled).length,
    disabled: data.filter(d => !d.enabled).length,
  }), [data]);

  return (
    <div>
      {/* Channel stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '渠道总数', value: channelStats.total, icon: <BellOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '已启用', value: channelStats.enabled, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '已禁用', value: channelStats.disabled, icon: <CloseCircleOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
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

      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建渠道</Button>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} size="small" scroll={{ x: 800 }} />
      </Card>

      <Modal title={editRecord ? '编辑渠道' : '新建渠道'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={560}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="渠道名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="渠道类型" rules={[{ required: true }]}>
            <Select options={Object.entries(typeLabels).map(([k, v]) => ({ value: k, label: v }))} onChange={(v: string) => setChannelType(v)} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>

          {channelType === 'EMAIL' && (<>
            <Form.Item name="smtpHost" label="SMTP 服务器" rules={[{ required: true }]}><Input placeholder="smtp.example.com" /></Form.Item>
            <Form.Item name="smtpPort" label="SMTP 端口" initialValue={465}><Input type="number" /></Form.Item>
            <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password /></Form.Item>
            <Form.Item name="from" label="发件人"><Input placeholder="noreply@example.com" /></Form.Item>
            <Form.Item name="useSsl" label="SSL" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
          </>)}

          {channelType === 'WEBHOOK' && (<>
            <Form.Item name="url" label="Webhook URL" rules={[{ required: true }]}><Input placeholder="https://example.com/webhook" /></Form.Item>
            <Form.Item name="method" label="HTTP 方法" initialValue="POST">
              <Select options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
            </Form.Item>
            <Form.Item name="contentType" label="Content-Type" initialValue="application/json"><Input /></Form.Item>
            <Form.Item name="secret" label="Secret"><Input.Password placeholder="可选" /></Form.Item>
          </>)}

          {channelType === 'SMS' && (<>
            <Form.Item name="provider" label="短信服务商"><Input placeholder="aliyun / tencent" /></Form.Item>
            <Form.Item name="accessKeyId" label="AccessKey ID"><Input /></Form.Item>
            <Form.Item name="accessKeySecret" label="AccessKey Secret"><Input.Password /></Form.Item>
            <Form.Item name="signName" label="签名"><Input /></Form.Item>
          </>)}
        </Form>
      </Modal>
    </div>
  );
};

// ==================== Record Tab ====================

const RecordTab: React.FC = () => {
  const [data, setData] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<RecordItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationRecordApi.list({ ...params, channelType: filterType, status: filterStatus });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载记录失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterType, filterStatus]);

  const handleViewDetail = async (record: RecordItem) => {
    try {
      const res = await notificationRecordApi.get(record.id);
      setDetailRecord(res.data.data);
      setDetailOpen(true);
    } catch { message.error('加载详情失败'); }
  };

  const columns: ColumnsType<RecordItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 170 },
    { title: '渠道', dataIndex: 'channelType', width: 90, render: (v: string) => <Tag color={typeColors[v]}>{typeLabels[v] || v}</Tag> },
    { title: '模板', dataIndex: 'templateCode', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '主题', dataIndex: 'subject', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    { title: '接收方', dataIndex: 'recipient', width: 200, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'SUCCESS' ? 'success' : v === 'FAILED' ? 'error' : 'processing'}>{v === 'SUCCESS' ? '成功' : v === 'FAILED' ? '失败' : '待发送'}</Tag> },
    { title: '重试', dataIndex: 'retryCount', width: 60 },
    {
      title: '操作', width: 70, fixed: 'right',
      render: (_: unknown, record: RecordItem) => <a onClick={() => handleViewDetail(record)}><EyeOutlined /> 详情</a>,
    },
  ];

  const recordStats = useMemo(() => ({
    success: data.filter(d => d.status === 'SUCCESS').length,
    failed: data.filter(d => d.status === 'FAILED').length,
    pending: data.filter(d => d.status === 'PENDING').length,
  }), [data]);

  return (
    <div>
      {/* Record stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '记录总数', value: total, icon: <SendOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '发送成功', value: recordStats.success, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '发送失败', value: recordStats.failed, icon: <CloseCircleOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
          { title: '待发送', value: recordStats.pending, icon: <MailOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
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
          <Select placeholder="渠道" allowClear style={{ width: 120 }}
            options={Object.entries(typeLabels).map(([k, v]) => ({ value: k, label: v }))}
            onChange={(v: string) => { setFilterType(v); setParams({ ...params, pageNum: 1 }); }} />
          <Select placeholder="状态" allowClear style={{ width: 100 }}
            options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }, { value: 'PENDING', label: '待发送' }]}
            onChange={(v: string) => { setFilterStatus(v); setParams({ ...params, pageNum: 1 }); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1100 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="通知记录详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={650}>
        {detailRecord && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="ID">{detailRecord.id}</Descriptions.Item>
            <Descriptions.Item label="时间">{detailRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="渠道"><Tag color={typeColors[detailRecord.channelType]}>{typeLabels[detailRecord.channelType]}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailRecord.status === 'SUCCESS' ? 'success' : 'error'}>{detailRecord.status === 'SUCCESS' ? '成功' : '失败'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="模板">{detailRecord.templateCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="发送时间">{detailRecord.sentAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="主题" span={2}>{detailRecord.subject || '-'}</Descriptions.Item>
            <Descriptions.Item label="接收方" span={2}>{detailRecord.recipient}</Descriptions.Item>
            <Descriptions.Item label="内容" span={2}>
              <pre style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>{detailRecord.content}</pre>
            </Descriptions.Item>
            {detailRecord.errorMessage && (
              <Descriptions.Item label="错误信息" span={2}>
                <span style={{ color: '#ff4d4f' }}>{detailRecord.errorMessage}</span>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

// ==================== Main Page ====================

const NotificationPage: React.FC = () => {
  return (
    <div>
      <PageHeader title="通知中心" description="管理通知渠道与发送记录" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="channel" items={[
          { key: 'channel', label: <span><BellOutlined style={{ marginRight: 6 }} />通知渠道</span>, children: <ChannelTab /> },
          { key: 'record', label: <span><SendOutlined style={{ marginRight: 6 }} />发送记录</span>, children: <RecordTab /> },
        ]} />
      </Card>
    </div>
  );
};

export default NotificationPage;
