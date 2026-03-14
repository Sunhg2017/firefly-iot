import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { permissionResourceApi } from '../../services/api';

interface ResourceItem {
  id: number;
  parentId: number;
  code: string;
  name: string;
  type: string;
  icon?: string;
  path?: string;
  sortOrder?: number;
  enabled?: boolean;
  description?: string;
  children?: ResourceItem[];
}

const typeLabels: Record<string, string> = {
  MENU: '菜单',
  BUTTON: '按钮',
  API: '接口',
};

const typeColors: Record<string, string> = {
  MENU: 'blue',
  BUTTON: 'green',
  API: 'orange',
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const PermissionResourcePage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourceTree, setResourceTree] = useState<ResourceItem[]>([]);
  const [resourceList, setResourceList] = useState<ResourceItem[]>([]);
  const [editingRecord, setEditingRecord] = useState<ResourceItem | null>(null);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const [treeRes, listRes] = await Promise.all([permissionResourceApi.tree(), permissionResourceApi.list()]);
      setResourceTree(treeRes.data?.data || []);
      setResourceList(listRes.data?.data || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载权限资源失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchResources();
  }, []);

  const stats = useMemo(
    () => ({
      total: resourceList.length,
      enabled: resourceList.filter((item) => item.enabled).length,
      menus: resourceList.filter((item) => item.type === 'MENU').length,
    }),
    [resourceList],
  );

  const parentOptions = useMemo(
    () => [
      { value: 0, label: '顶级资源' },
      ...resourceList
        .filter((item) => item.type === 'MENU')
        .map((item) => ({ value: item.id, label: `${item.name} (${item.code})` })),
    ],
    [resourceList],
  );

  const openCreateDrawer = (parentId?: number) => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      parentId: parentId ?? 0,
      type: parentId ? 'BUTTON' : 'MENU',
      sortOrder: 0,
      enabled: true,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: ResourceItem) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await permissionResourceApi.delete(id);
      message.success('权限资源已删除');
      void fetchResources();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败，请先清理下级权限资源'));
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingRecord) {
        await permissionResourceApi.update(editingRecord.id, values);
        message.success('权限资源已更新');
      } else {
        await permissionResourceApi.create(values);
        message.success('权限资源已创建');
      }
      setDrawerOpen(false);
      form.resetFields();
      void fetchResources();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '保存权限资源失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ResourceItem> = [
    {
      title: '资源名称',
      dataIndex: 'name',
      width: 220,
    },
    {
      title: '权限编码',
      dataIndex: 'code',
      width: 220,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (value: string) => <Tag color={typeColors[value] || 'default'}>{typeLabels[value] || value}</Tag>,
    },
    {
      title: '路径',
      dataIndex: 'path',
      width: 240,
      render: (value?: string) => value || '-',
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (value?: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? '启用' : '停用'}</Tag>,
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openCreateDrawer(record.id)}>
            下级
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该权限资源？" onConfirm={() => void handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="权限资源"
        description="在这里维护系统中的权限资源编码、资源层级和接口路径。菜单编排请前往“系统菜单权限管理”。"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
            新建权限
          </Button>
        )}
      />

      <Space size={16} wrap style={{ marginBottom: 16 }}>
        <Card bordered={false} style={{ minWidth: 160 }}>
          <Statistic title="资源总数" value={stats.total} />
        </Card>
        <Card bordered={false} style={{ minWidth: 160 }}>
          <Statistic title="启用资源" value={stats.enabled} />
        </Card>
        <Card bordered={false} style={{ minWidth: 160 }}>
          <Statistic title="菜单资源" value={stats.menus} />
        </Card>
      </Space>

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={resourceTree}
          loading={loading}
          pagination={false}
          defaultExpandAllRows
          scroll={{ x: 1200 }}
        />
      </Card>

      <Drawer
        title={editingRecord ? '编辑权限资源' : '新建权限资源'}
        open={drawerOpen}
        width={520}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={(
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="父级资源" rules={[{ required: true, message: '请选择父级资源' }]}>
            <Select options={parentOptions} />
          </Form.Item>
          <Form.Item
            name="code"
            label="权限编码"
            rules={[{ required: true, message: '请输入权限编码' }]}
          >
            <Input placeholder="例如 device:read" disabled={!!editingRecord} />
          </Form.Item>
          <Form.Item
            name="name"
            label="资源名称"
            rules={[{ required: true, message: '请输入资源名称' }]}
          >
            <Input />
          </Form.Item>
          <Space size={16} align="start" style={{ display: 'flex' }}>
            <Form.Item name="type" label="资源类型" rules={[{ required: true, message: '请选择资源类型' }]} style={{ minWidth: 160 }}>
              <Select
                options={[
                  { value: 'MENU', label: '菜单' },
                  { value: 'BUTTON', label: '按钮' },
                  { value: 'API', label: '接口' },
                ]}
              />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" style={{ minWidth: 120 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用状态" valuePropName="checked" style={{ minWidth: 120 }}>
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Space>
          <Form.Item name="icon" label="图标">
            <Input placeholder="Ant Design 图标名称" />
          </Form.Item>
          <Form.Item name="path" label="路径">
            <Input placeholder="前端路由或 API 路径" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default PermissionResourcePage;
