import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, Tag, Popconfirm, InputNumber, Switch, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { permissionResourceApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';


interface ResourceItem {
  id: number; parentId: number; code: string; name: string; type: string;
  icon: string; path: string; sortOrder: number; enabled: boolean; description: string; children?: ResourceItem[];
}

const typeLabels: Record<string, string> = { MENU: '菜单', BUTTON: '按钮', API: 'API' };
const typeColors: Record<string, string> = { MENU: 'blue', BUTTON: 'green', API: 'orange' };

const PermissionResourcePage: React.FC = () => {
  const [treeData, setTreeData] = useState<ResourceItem[]>([]);
  const [flatData, setFlatData] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ResourceItem | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [treeRes, listRes] = await Promise.all([permissionResourceApi.tree(), permissionResourceApi.list()]);
      setTreeData(treeRes.data.data || []);
      setFlatData(listRes.data.data || []);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (record: ResourceItem | null) => {
    setEditRecord(record);
    if (record) { form.setFieldsValue(record); }
    else { form.resetFields(); form.setFieldsValue({ type: 'MENU', parentId: 0, sortOrder: 0, enabled: true }); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) { await permissionResourceApi.update(editRecord.id, values); message.success('更新成功'); }
      else { await permissionResourceApi.create(values); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = async (id: number) => {
    try { await permissionResourceApi.delete(id); message.success('已删除'); fetchData(); }
    catch { message.error('删除失败，请先删除子权限'); }
  };

  const columns = [
    { title: '权限名称', dataIndex: 'name', width: 200 },
    { title: '权限编码', dataIndex: 'code', width: 180 },
    { title: '类型', dataIndex: 'type', width: 80, render: (v: string) => <Tag color={typeColors[v]}>{typeLabels[v] || v}</Tag> },
    { title: '路径', dataIndex: 'path', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '图标', dataIndex: 'icon', width: 100, render: (v: string) => v || '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '状态', dataIndex: 'enabled', width: 60, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '禁用'}</Tag> },
    {
      title: '操作', width: 180, fixed: 'right' as const,
      render: (_: unknown, record: ResourceItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ type: 'BUTTON', parentId: record.id, sortOrder: 0, enabled: true }); setEditRecord(null); setEditOpen(true); }}>子项</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const parentOptions = [{ value: 0, label: '顶级' }, ...flatData.filter((r) => r.type === 'MENU').map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }))];

  return (
    <div>
      <PageHeader
        title="权限资源管理"
        description={`共 ${flatData.length} 个权限资源`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建权限</Button>}
      />

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={treeData} loading={loading} size="small" scroll={{ x: 1100 }}
          pagination={false} defaultExpandAllRows />
      </Card>

      <Modal title={editRecord ? '编辑权限' : '新建权限'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="parentId" label="上级权限" rules={[{ required: true }]}>
            <Select options={parentOptions} />
          </Form.Item>
          <Form.Item name="code" label="权限编码" rules={[{ required: true }]}>
            <Input placeholder="如: device:read" disabled={!!editRecord} />
          </Form.Item>
          <Form.Item name="name" label="权限名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={[{ value: 'MENU', label: '菜单' }, { value: 'BUTTON', label: '按钮' }, { value: 'API', label: 'API' }]} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序"><InputNumber style={{ width: 100 }} /></Form.Item>
            <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="禁用" /></Form.Item>
          </Space>
          <Form.Item name="icon" label="图标"><Input placeholder="Ant Design 图标名" /></Form.Item>
          <Form.Item name="path" label="路径"><Input placeholder="前端路由或API路径" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PermissionResourcePage;
