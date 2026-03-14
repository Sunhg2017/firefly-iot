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
  Tabs,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { permissionResourceApi, workspacePermissionCatalogApi } from '../../services/api';

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

interface CatalogItem {
  id: number;
  workspaceScope: 'PLATFORM' | 'TENANT' | string;
  moduleKey: string;
  moduleLabel: string;
  menuPath: string;
  permissionCode: string;
  permissionLabel: string;
  moduleSortOrder: number;
  permissionSortOrder: number;
  roleCatalogVisible: boolean;
}

const typeLabels: Record<string, string> = {
  MENU: '菜单',
  BUTTON: '按钮',
  API: 'API',
};

const typeColors: Record<string, string> = {
  MENU: 'blue',
  BUTTON: 'green',
  API: 'orange',
};

const workspaceLabels: Record<string, string> = {
  PLATFORM: '系统运维空间',
  TENANT: '租户业务空间',
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const PermissionResourcePage: React.FC = () => {
  const [resourceForm] = Form.useForm();
  const [catalogForm] = Form.useForm();

  const [resourceLoading, setResourceLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [resourceTree, setResourceTree] = useState<ResourceItem[]>([]);
  const [resourceList, setResourceList] = useState<ResourceItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ResourceItem | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchResources = async () => {
    setResourceLoading(true);
    try {
      const [treeRes, listRes] = await Promise.all([permissionResourceApi.tree(), permissionResourceApi.list()]);
      setResourceTree(treeRes.data?.data || []);
      setResourceList(listRes.data?.data || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载权限资源失败'));
    } finally {
      setResourceLoading(false);
    }
  };

  const fetchCatalog = async (params?: { workspaceScope?: string; keyword?: string }) => {
    setCatalogLoading(true);
    try {
      const res = await workspacePermissionCatalogApi.list(params);
      setCatalogItems(res.data?.data || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载空间权限目录失败'));
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    void fetchResources();
    void fetchCatalog();
  }, []);

  const resourceSummary = useMemo(
    () => ({
      total: resourceList.length,
      enabled: resourceList.filter((item) => item.enabled).length,
      menus: resourceList.filter((item) => item.type === 'MENU').length,
    }),
    [resourceList],
  );

  const catalogSummary = useMemo(
    () => ({
      total: catalogItems.length,
      platform: catalogItems.filter((item) => item.workspaceScope === 'PLATFORM').length,
      tenant: catalogItems.filter((item) => item.workspaceScope === 'TENANT').length,
    }),
    [catalogItems],
  );

  const openCreateDrawer = (parentId?: number) => {
    setEditingRecord(null);
    resourceForm.resetFields();
    resourceForm.setFieldsValue({
      parentId: parentId ?? 0,
      type: parentId ? 'BUTTON' : 'MENU',
      sortOrder: 0,
      enabled: true,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: ResourceItem) => {
    setEditingRecord(record);
    resourceForm.setFieldsValue(record);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await permissionResourceApi.delete(id);
      message.success('权限资源已删除');
      void fetchResources();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败，请先清理子权限'));
    }
  };

  const handleSave = async () => {
    try {
      const values = await resourceForm.validateFields();
      setSaving(true);
      if (editingRecord) {
        await permissionResourceApi.update(editingRecord.id, values);
        message.success('权限资源已更新');
      } else {
        await permissionResourceApi.create(values);
        message.success('权限资源已创建');
      }
      setDrawerOpen(false);
      resourceForm.resetFields();
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

  const handleCatalogSearch = async () => {
    const values = await catalogForm.validateFields();
    await fetchCatalog({
      workspaceScope: values.workspaceScope || undefined,
      keyword: values.keyword?.trim() || undefined,
    });
  };

  const handleCatalogReset = () => {
    catalogForm.resetFields();
    void fetchCatalog();
  };

  const parentOptions = useMemo(
    () => [
      { value: 0, label: '顶级' },
      ...resourceList
        .filter((item) => item.type === 'MENU')
        .map((item) => ({ value: item.id, label: `${item.name} (${item.code})` })),
    ],
    [resourceList],
  );

  const resourceColumns: ColumnsType<ResourceItem> = [
    {
      title: '权限名称',
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
      width: 220,
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
            子项
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该权限资源吗？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const catalogColumns: ColumnsType<CatalogItem> = [
    {
      title: '所属空间',
      dataIndex: 'workspaceScope',
      width: 140,
      render: (value: string) => <Tag color={value === 'PLATFORM' ? 'gold' : 'blue'}>{workspaceLabels[value] || value}</Tag>,
    },
    {
      title: '菜单模块',
      dataIndex: 'moduleLabel',
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.moduleLabel}</span>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{record.moduleKey}</span>
        </Space>
      ),
    },
    {
      title: '菜单路径',
      dataIndex: 'menuPath',
      width: 200,
    },
    {
      title: '权限点',
      dataIndex: 'permissionCode',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.permissionCode}</span>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{record.permissionLabel}</span>
        </Space>
      ),
    },
    {
      title: '角色目录',
      dataIndex: 'roleCatalogVisible',
      width: 120,
      render: (value: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? '展示' : '隐藏'}</Tag>,
    },
    {
      title: '排序',
      width: 120,
      render: (_value, record) => `${record.moduleSortOrder}-${record.permissionSortOrder}`,
    },
  ];

  return (
    <div>
      <PageHeader
        title="权限资源"
        description="运维空间统一维护权限资源，并通过空间权限目录台账追踪菜单、权限点与所属空间的对应关系。后续功能调整请同步补 SQL。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
            新建权限
          </Button>
        }
      />

      <Tabs
        defaultActiveKey="resources"
        items={[
          {
            key: 'resources',
            label: '权限资源管理',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space size={16} wrap>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="总资源数" value={resourceSummary.total} />
                  </Card>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="启用资源" value={resourceSummary.enabled} />
                  </Card>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="菜单资源" value={resourceSummary.menus} />
                  </Card>
                </Space>
                <Card bordered={false}>
                  <Table
                    rowKey="id"
                    columns={resourceColumns}
                    dataSource={resourceTree}
                    loading={resourceLoading}
                    pagination={false}
                    defaultExpandAllRows
                    scroll={{ x: 1200 }}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'catalog',
            label: '空间权限目录',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space size={16} wrap>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="目录记录" value={catalogSummary.total} />
                  </Card>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="系统空间记录" value={catalogSummary.platform} />
                  </Card>
                  <Card bordered={false} style={{ minWidth: 160 }}>
                    <Statistic title="租户空间记录" value={catalogSummary.tenant} />
                  </Card>
                </Space>
                <Card
                  bordered={false}
                  title="目录筛选"
                  extra={
                    <Space>
                      <Button onClick={handleCatalogReset}>重置</Button>
                      <Button type="primary" onClick={() => void handleCatalogSearch()}>
                        查询
                      </Button>
                    </Space>
                  }
                >
                  <Form form={catalogForm} layout="inline">
                    <Form.Item name="workspaceScope" label="所属空间">
                      <Select
                        style={{ width: 180 }}
                        allowClear
                        options={[
                          { value: 'PLATFORM', label: '系统运维空间' },
                          { value: 'TENANT', label: '租户业务空间' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="keyword" label="关键字">
                      <Input style={{ width: 280 }} placeholder="模块名称、菜单路径、权限点" />
                    </Form.Item>
                  </Form>
                </Card>
                <Card bordered={false}>
                  <Table
                    rowKey="id"
                    columns={catalogColumns}
                    dataSource={catalogItems}
                    loading={catalogLoading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 1100 }}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editingRecord ? '编辑权限资源' : '新建权限资源'}
        open={drawerOpen}
        width={520}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={resourceForm} layout="vertical">
          <Form.Item name="parentId" label="上级权限" rules={[{ required: true, message: '请选择上级权限' }]}>
            <Select options={parentOptions} />
          </Form.Item>
          <Form.Item name="code" label="权限编码" rules={[{ required: true, message: '请输入权限编码' }]}>
            <Input placeholder="例如 device:read" disabled={!!editingRecord} />
          </Form.Item>
          <Form.Item name="name" label="权限名称" rules={[{ required: true, message: '请输入权限名称' }]}>
            <Input />
          </Form.Item>
          <Space size={16} align="start" style={{ display: 'flex' }}>
            <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]} style={{ minWidth: 160 }}>
              <Select
                options={[
                  { value: 'MENU', label: '菜单' },
                  { value: 'BUTTON', label: '按钮' },
                  { value: 'API', label: 'API' },
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
