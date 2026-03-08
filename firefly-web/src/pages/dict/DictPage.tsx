import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Tag, Popconfirm, Drawer, InputNumber, Switch, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { dictApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface DictTypeItem {
  id: number; code: string; name: string; systemFlag: boolean; enabled: boolean; description: string; createdAt: string;
}
interface DictItemRecord {
  id: number; dictTypeId: number; itemValue: string; itemLabel: string; itemLabel2: string;
  sortOrder: number; enabled: boolean; cssClass: string; description: string;
}

const DictPage: React.FC = () => {
  const [types, setTypes] = useState<DictTypeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [editType, setEditType] = useState<DictTypeItem | null>(null);
  const [typeForm] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentType, setCurrentType] = useState<DictTypeItem | null>(null);
  const [items, setItems] = useState<DictItemRecord[]>([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<DictItemRecord | null>(null);
  const [itemForm] = Form.useForm();

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (keyword) query.keyword = keyword;
      const res = await dictApi.listTypes(query);
      const page = res.data.data;
      setTypes(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchTypes(); }, [params.pageNum, params.pageSize]);

  const fetchItems = async (typeId: number) => {
    setItemLoading(true);
    try {
      const res = await dictApi.listItems(typeId);
      setItems(res.data.data || []);
    } catch { message.error('加载字典项失败'); } finally { setItemLoading(false); }
  };

  const handleEditType = (record: DictTypeItem | null) => {
    setEditType(record);
    if (record) typeForm.setFieldsValue(record);
    else { typeForm.resetFields(); typeForm.setFieldsValue({ enabled: true }); }
    setTypeOpen(true);
  };

  const handleSaveType = async (values: Record<string, unknown>) => {
    try {
      if (editType) { await dictApi.updateType(editType.id, values); message.success('更新成功'); }
      else { await dictApi.createType(values); message.success('创建成功'); }
      setTypeOpen(false); fetchTypes();
    } catch { message.error('保存失败'); }
  };

  const handleDeleteType = async (id: number) => {
    await dictApi.deleteType(id); message.success('已删除'); fetchTypes();
  };

  const openItems = (record: DictTypeItem) => {
    setCurrentType(record); setDrawerOpen(true); fetchItems(record.id);
  };

  const handleEditItem = (record: DictItemRecord | null) => {
    setEditItem(record);
    if (record) itemForm.setFieldsValue(record);
    else { itemForm.resetFields(); itemForm.setFieldsValue({ sortOrder: 0, enabled: true }); }
    setItemOpen(true);
  };

  const handleSaveItem = async (values: Record<string, unknown>) => {
    try {
      if (editItem) { await dictApi.updateItem(editItem.id, values); message.success('更新成功'); }
      else if (currentType) { await dictApi.createItem(currentType.id, values); message.success('创建成功'); }
      setItemOpen(false); if (currentType) fetchItems(currentType.id);
    } catch { message.error('保存失败'); }
  };

  const handleDeleteItem = async (id: number) => {
    await dictApi.deleteItem(id); message.success('已删除'); if (currentType) fetchItems(currentType.id);
  };

  const typeColumns: ColumnsType<DictTypeItem> = [
    { title: '字典编码', dataIndex: 'code', width: 160 },
    { title: '字典名称', dataIndex: 'name', width: 160 },
    { title: '系统', dataIndex: 'systemFlag', width: 60, render: (v: boolean) => v ? <Tag color="red">系统</Tag> : <Tag>自定义</Tag> },
    { title: '状态', dataIndex: 'enabled', width: 60, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '禁用'}</Tag> },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_: unknown, record: DictTypeItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<UnorderedListOutlined />} onClick={() => openItems(record)}>字典项</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditType(record)} disabled={record.systemFlag}>编辑</Button>
          <Popconfirm title="确认删除？将同时删除所有字典项" onConfirm={() => handleDeleteType(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={record.systemFlag}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<DictItemRecord> = [
    { title: '值', dataIndex: 'itemValue', width: 120 },
    { title: '标签', dataIndex: 'itemLabel', width: 140 },
    { title: '备用标签', dataIndex: 'itemLabel2', width: 120, render: (v: string) => v || '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '状态', dataIndex: 'enabled', width: 60, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启' : '禁'}</Tag> },
    { title: '样式', dataIndex: 'cssClass', width: 100, render: (v: string) => v || '-' },
    {
      title: '操作', width: 140,
      render: (_: unknown, record: DictItemRecord) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditItem(record)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDeleteItem(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="数据字典"
        description={`共 ${total} 个字典类型`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEditType(null)}>新建字典</Button>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Input.Search placeholder="搜索编码/名称" allowClear style={{ width: 220 }}
          onSearch={(v: string) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchTypes(); }} />
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={typeColumns} dataSource={types} loading={loading} size="small" scroll={{ x: 900 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title={editType ? '编辑字典' : '新建字典'} open={typeOpen} onCancel={() => setTypeOpen(false)} onOk={() => typeForm.submit()} destroyOnClose width={480}>
        <Form form={typeForm} layout="vertical" onFinish={handleSaveType}>
          <Form.Item name="code" label="字典编码" rules={[{ required: true }]}>
            <Input placeholder="如: device_status" disabled={!!editType} />
          </Form.Item>
          <Form.Item name="name" label="字典名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="禁用" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={`字典项 - ${currentType?.name || ''} (${currentType?.code || ''})`} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={700}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleEditItem(null)}>新增</Button>}>
        <Table rowKey="id" columns={itemColumns} dataSource={items} loading={itemLoading} size="small" pagination={false} />
      </Drawer>

      <Modal title={editItem ? '编辑字典项' : '新建字典项'} open={itemOpen} onCancel={() => setItemOpen(false)} onOk={() => itemForm.submit()} destroyOnClose width={460}>
        <Form form={itemForm} layout="vertical" onFinish={handleSaveItem}>
          <Form.Item name="itemValue" label="值" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="itemLabel" label="标签" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="itemLabel2" label="备用标签"><Input placeholder="如英文标签" /></Form.Item>
          <Space>
            <Form.Item name="sortOrder" label="排序"><InputNumber style={{ width: 100 }} /></Form.Item>
            <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="禁用" /></Form.Item>
          </Space>
          <Form.Item name="cssClass" label="样式类名"><Input placeholder="前端 Tag/Badge 样式" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DictPage;
