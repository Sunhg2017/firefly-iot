import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Tag, Popconfirm, Drawer, InputNumber, List, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagOutlined } from '@ant-design/icons';
import { deviceTagApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface TagItem {
  id: number; tagKey: string; tagValue: string; color: string; description: string; deviceCount: number; createdAt: string;
}
interface BindingItem { id: number; tagId: number; deviceId: number; createdAt: string; }

const DeviceTagPage: React.FC = () => {
  const [data, setData] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TagItem | null>(null);
  const [form] = Form.useForm();

  const [deviceDrawerOpen, setDeviceDrawerOpen] = useState(false);
  const [currentTagId, setCurrentTagId] = useState<number>(0);
  const [bindings, setBindings] = useState<BindingItem[]>([]);
  const [bindDeviceId, setBindDeviceId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await deviceTagApi.list({ ...params, keyword: keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: TagItem | null) => {
    setEditRecord(record);
    if (record) { form.setFieldsValue({ ...record }); } else { form.resetFields(); form.setFieldValue('color', '#1890ff'); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const color = typeof values.color === 'string' ? values.color : '#1890ff';
      const payload = { ...values, color };
      if (editRecord) { await deviceTagApi.update(editRecord.id, payload); message.success('更新成功'); }
      else { await deviceTagApi.create(payload); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = async (id: number) => {
    await deviceTagApi.delete(id); message.success('已删除'); fetchData();
  };

  const openDevices = async (tagId: number) => {
    setCurrentTagId(tagId); setDeviceDrawerOpen(true);
    try { const res = await deviceTagApi.listDevices(tagId); setBindings(res.data.data || []); } catch { message.error('加载设备失败'); }
  };

  const handleBind = async () => {
    if (!bindDeviceId) return;
    try { await deviceTagApi.bindTag(currentTagId, bindDeviceId); message.success('绑定成功'); openDevices(currentTagId); setBindDeviceId(null); fetchData(); }
    catch { message.error('绑定失败'); }
  };

  const handleUnbind = async (deviceId: number) => {
    await deviceTagApi.unbindTag(currentTagId, deviceId); message.success('已解绑'); openDevices(currentTagId); fetchData();
  };

  const columns: ColumnsType<TagItem> = [
    {
      title: '标签', width: 200,
      render: (_: unknown, record: TagItem) => (
        <Tag color={record.color}>{record.tagKey}: {record.tagValue}</Tag>
      ),
    },
    { title: '标签键', dataIndex: 'tagKey', width: 120 },
    { title: '标签值', dataIndex: 'tagValue', width: 150 },
    { title: '设备数', dataIndex: 'deviceCount', width: 80 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_: unknown, record: TagItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<TagOutlined />} onClick={() => openDevices(record.id)}>设备</Button>
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
        title="设备标签"
        description={`共 ${total} 个标签`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建标签</Button>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Input.Search placeholder="搜索标签键/值" allowClear style={{ width: 220 }}
          onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1000 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title={editRecord ? '编辑标签' : '新建标签'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={460}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="tagKey" label="标签键" rules={[{ required: true, message: '请输入标签键' }]}>
            <Input placeholder="如：env / region / type" disabled={!!editRecord} />
          </Form.Item>
          <Form.Item name="tagValue" label="标签值" rules={[{ required: true, message: '请输入标签值' }]}>
            <Input placeholder="如：production / cn-east / sensor" />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input placeholder="#1890ff" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="标签关联设备" open={deviceDrawerOpen} onClose={() => setDeviceDrawerOpen(false)} width={420}>
        <Space style={{ marginBottom: 16 }}>
          <InputNumber placeholder="设备ID" value={bindDeviceId} onChange={(v) => setBindDeviceId(v)} style={{ width: 120 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleBind} size="small">绑定设备</Button>
        </Space>
        <List dataSource={bindings} renderItem={(item: BindingItem) => (
          <List.Item actions={[
            <Popconfirm key="rm" title="确认解绑？" onConfirm={() => handleUnbind(item.deviceId)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>解绑</Button>
            </Popconfirm>
          ]}>
            <List.Item.Meta title={`设备 #${item.deviceId}`} description={`绑定时间: ${item.createdAt}`} />
          </List.Item>
        )} />
      </Drawer>
    </div>
  );
};

export default DeviceTagPage;
