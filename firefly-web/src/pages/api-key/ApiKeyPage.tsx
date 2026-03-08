import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, Tag, Popconfirm, InputNumber, DatePicker, Drawer, Descriptions, Tooltip, Typography, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, StopOutlined, CheckCircleOutlined, BarChartOutlined } from '@ant-design/icons';
import { apiKeyApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';

const { Text, Paragraph } = Typography;

interface ApiKeyItem {
  id: number;
  name: string;
  description: string;
  accessKey: string;
  scopes: string[];
  rateLimitPerMin: number;
  rateLimitPerDay: number;
  status: string;
  expireAt: string;
  lastUsedAt: string;
  createdAt: string;
}

interface CreatedKey {
  accessKey: string;
  secretKey: string;
  name: string;
}

const statusMap: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: 'success', label: '活跃' },
  DISABLED: { color: 'default', label: '禁用' },
  EXPIRED: { color: 'warning', label: '过期' },
  DELETED: { color: 'error', label: '已删除' },
};

const ApiKeyPage: React.FC = () => {
  const [data, setData] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ApiKeyItem | null>(null);
  const [form] = Form.useForm();

  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ApiKeyItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (keyword) query.keyword = keyword;
      const res = await apiKeyApi.list(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: ApiKeyItem | null) => {
    setEditRecord(record);
    if (record) {
      form.setFieldsValue({
        ...record,
        expireAt: record.expireAt ? dayjs(record.expireAt) : null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ rateLimitPerMin: 600, rateLimitPerDay: 100000, scopes: ['*'] });
    }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        ...values,
        expireAt: values.expireAt ? (values.expireAt as dayjs.Dayjs).format('YYYY-MM-DDTHH:mm:ss') : null,
      };
      if (editRecord) {
        await apiKeyApi.update(editRecord.id, payload);
        message.success('更新成功');
      } else {
        const res = await apiKeyApi.create(payload);
        const created = res.data.data;
        setCreatedKey({ accessKey: created.accessKey, secretKey: created.secretKey, name: created.name });
        message.success('创建成功');
      }
      setEditOpen(false);
      fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = (record: ApiKeyItem) => {
    Modal.confirm({
      title: '确认删除 API Key？',
      content: `删除「${record.name}」(${record.accessKey})？此操作不可恢复。`,
      onOk: async () => { await apiKeyApi.delete(record.id); message.success('删除成功'); fetchData(); },
    });
  };

  const handleToggleStatus = async (record: ApiKeyItem) => {
    const newStatus = record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    await apiKeyApi.updateStatus(record.id, newStatus);
    message.success(newStatus === 'ACTIVE' ? '已启用' : '已禁用');
    fetchData();
  };

  const handleDetail = (record: ApiKeyItem) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const columns: ColumnsType<ApiKeyItem> = [
    { title: '名称', dataIndex: 'name', width: 160, ellipsis: true },
    {
      title: 'Access Key', dataIndex: 'accessKey', width: 200,
      render: (v: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{v}</Text>
          <Tooltip title="复制"><CopyOutlined style={{ cursor: 'pointer', color: '#1890ff' }} onClick={() => copyToClipboard(v)} /></Tooltip>
        </Space>
      ),
    },
    {
      title: '权限范围', dataIndex: 'scopes', width: 140,
      render: (v: string[]) => (v || []).map((s: string) => <Tag key={s}>{s}</Tag>),
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={statusMap[v]?.color || 'default'}>{statusMap[v]?.label || v}</Tag>,
    },
    {
      title: '限流', width: 150,
      render: (_: unknown, record: ApiKeyItem) => (
        <span style={{ fontSize: 12 }}>{record.rateLimitPerMin}/min · {record.rateLimitPerDay}/day</span>
      ),
    },
    { title: '过期时间', dataIndex: 'expireAt', width: 170, render: (v: string) => v || '永不过期' },
    { title: '最后使用', dataIndex: 'lastUsedAt', width: 170, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_: unknown, record: ApiKeyItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<BarChartOutlined />} onClick={() => handleDetail(record)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small"
            icon={record.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleStatus(record)}>
            {record.status === 'ACTIVE' ? '禁用' : '启用'}
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="API Key 管理"
        description={`共 ${total} 个 API Key`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>创建 API Key</Button>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Input.Search placeholder="搜索名称/AccessKey" allowClear style={{ width: 260 }}
          onSearch={(v: string) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1400 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title={editRecord ? '编辑 API Key' : '创建 API Key'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：生产环境集成密钥" />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="scopes" label="权限范围">
            <Select mode="tags" placeholder="输入权限范围，* 表示全部">
              <Select.Option value="*">* (全部)</Select.Option>
              <Select.Option value="device:read">device:read</Select.Option>
              <Select.Option value="device:write">device:write</Select.Option>
              <Select.Option value="data:read">data:read</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Form.Item name="rateLimitPerMin" label="每分钟限流"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="rateLimitPerDay" label="每日限流"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
          </Space>
          <Form.Item name="expireAt" label="过期时间">
            <DatePicker showTime placeholder="留空则永不过期" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="API Key 创建成功" open={!!createdKey} onCancel={() => setCreatedKey(null)} onOk={() => setCreatedKey(null)}
        footer={[<Button key="ok" type="primary" onClick={() => setCreatedKey(null)}>我已保存</Button>]}>
        {createdKey && (
          <div>
            <Paragraph type="danger" strong>请立即复制并安全保存 Secret Key，关闭后将无法再次查看！</Paragraph>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="名称">{createdKey.name}</Descriptions.Item>
              <Descriptions.Item label="Access Key">
                <Space><Text code>{createdKey.accessKey}</Text><CopyOutlined style={{ cursor: 'pointer', color: '#1890ff' }} onClick={() => copyToClipboard(createdKey.accessKey)} /></Space>
              </Descriptions.Item>
              <Descriptions.Item label="Secret Key">
                <Space><Text code type="danger">{createdKey.secretKey}</Text><CopyOutlined style={{ cursor: 'pointer', color: '#1890ff' }} onClick={() => copyToClipboard(createdKey.secretKey)} /></Space>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>

      <Drawer title={`API Key 详情 - ${detailRecord?.name || ''}`} open={detailOpen} onClose={() => setDetailOpen(false)} width={520}>
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailRecord.id}</Descriptions.Item>
            <Descriptions.Item label="名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="描述">{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="Access Key"><Text code>{detailRecord.accessKey}</Text></Descriptions.Item>
            <Descriptions.Item label="权限范围">{(detailRecord.scopes || []).join(', ')}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMap[detailRecord.status]?.color}>{statusMap[detailRecord.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="限流">{detailRecord.rateLimitPerMin}/min · {detailRecord.rateLimitPerDay}/day</Descriptions.Item>
            <Descriptions.Item label="过期时间">{detailRecord.expireAt || '永不过期'}</Descriptions.Item>
            <Descriptions.Item label="最后使用">{detailRecord.lastUsedAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default ApiKeyPage;
