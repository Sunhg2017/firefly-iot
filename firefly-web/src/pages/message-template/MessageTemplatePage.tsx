import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, Tag, Popconfirm, Switch, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { messageTemplateApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface TemplateItem {
  id: number; code: string; name: string; channel: string; templateType: string;
  subject: string; content: string; variables: string; enabled: boolean; description: string; createdAt: string;
}

const channelLabels: Record<string, string> = { SMS: '短信', EMAIL: '邮件', WEBHOOK: 'Webhook', PUSH: '推送', WECHAT: '微信' };
const channelColors: Record<string, string> = { SMS: 'blue', EMAIL: 'green', WEBHOOK: 'orange', PUSH: 'purple', WECHAT: 'cyan' };
const typeLabels: Record<string, string> = { TEXT: '纯文本', HTML: 'HTML', MARKDOWN: 'Markdown' };

const MessageTemplatePage: React.FC = () => {
  const [data, setData] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [channelFilter, setChannelFilter] = useState<string | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TemplateItem | null>(null);
  const [form] = Form.useForm();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (keyword) query.keyword = keyword;
      if (channelFilter) query.channel = channelFilter;
      const res = await messageTemplateApi.list(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: TemplateItem | null) => {
    setEditRecord(record);
    if (record) { form.setFieldsValue(record); }
    else { form.resetFields(); form.setFieldsValue({ channel: 'EMAIL', templateType: 'TEXT', enabled: true }); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) { await messageTemplateApi.update(editRecord.id, values); message.success('更新成功'); }
      else { await messageTemplateApi.create(values); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = async (id: number) => {
    await messageTemplateApi.delete(id); message.success('已删除'); fetchData();
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    await messageTemplateApi.toggle(id, enabled); message.success(enabled ? '已启用' : '已禁用'); fetchData();
  };

  const handlePreview = async (record: TemplateItem) => {
    try {
      const res = await messageTemplateApi.preview({ content: record.content, variables: { deviceName: '温湿度传感器-01', alarmLevel: '严重', alarmTime: '2024-01-15 10:30:00' } });
      setPreviewContent(res.data.data);
      setPreviewOpen(true);
    } catch { message.error('预览失败'); }
  };

  const columns: ColumnsType<TemplateItem> = [
    { title: '模板编码', dataIndex: 'code', width: 160 },
    { title: '模板名称', dataIndex: 'name', width: 160 },
    { title: '渠道', dataIndex: 'channel', width: 90, render: (v: string) => <Tag color={channelColors[v]}>{channelLabels[v] || v}</Tag> },
    { title: '类型', dataIndex: 'templateType', width: 90, render: (v: string) => typeLabels[v] || v },
    { title: '主题', dataIndex: 'subject', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: boolean, r: TemplateItem) => <Switch size="small" checked={v} onChange={(c) => handleToggle(r.id, c)} />,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 220, fixed: 'right',
      render: (_: unknown, record: TemplateItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>预览</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="消息模板"
        description={`共 ${total} 个模板`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建模板</Button>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Select placeholder="渠道" allowClear style={{ width: 110 }} value={channelFilter}
            onChange={(v) => { setChannelFilter(v); setParams({ ...params, pageNum: 1 }); }}
            options={[{ value: 'SMS', label: '短信' }, { value: 'EMAIL', label: '邮件' }, { value: 'WEBHOOK', label: 'Webhook' }, { value: 'PUSH', label: '推送' }, { value: 'WECHAT', label: '微信' }]} />
          <Input.Search placeholder="搜索编码/名称" allowClear style={{ width: 200 }}
            onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1200 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title={editRecord ? '编辑模板' : '新建模板'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={640}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="模板编码" rules={[{ required: true }]}>
            <Input placeholder="如: alarm_notify" disabled={!!editRecord} />
          </Form.Item>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space>
            <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={[{ value: 'SMS', label: '短信' }, { value: 'EMAIL', label: '邮件' }, { value: 'WEBHOOK', label: 'Webhook' }, { value: 'PUSH', label: '推送' }, { value: 'WECHAT', label: '微信' }]} />
            </Form.Item>
            <Form.Item name="templateType" label="模板类型" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={[{ value: 'TEXT', label: '纯文本' }, { value: 'HTML', label: 'HTML' }, { value: 'MARKDOWN', label: 'Markdown' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="subject" label="主题"><Input placeholder="邮件主题（邮件渠道必填）" /></Form.Item>
          <Form.Item name="content" label="模板内容" rules={[{ required: true }]} tooltip="使用 ${variableName} 作为变量占位符">
            <Input.TextArea rows={5} placeholder="设备 ${deviceName} 触发 ${alarmLevel} 告警，时间: ${alarmTime}" />
          </Form.Item>
          <Form.Item name="variables" label="变量定义" tooltip='JSON格式，如 [{"name":"deviceName","desc":"设备名称"}]'>
            <Input.TextArea rows={2} placeholder='[{"name":"deviceName","desc":"设备名称"},{"name":"alarmLevel","desc":"告警级别"}]' />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="模板预览" open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={500}>
        <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {previewContent}
        </div>
      </Modal>
    </div>
  );
};

export default MessageTemplatePage;
