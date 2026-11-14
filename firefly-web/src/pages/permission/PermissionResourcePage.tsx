import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { permissionResourceApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';

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

/**
 * 收集某个节点及其全部子孙的 id，用于在编辑父级时排除自身和子树。
 * 使用扁平列表按 parentId 收敛，避免依赖 tree 接口是否返回完整 children。
 */
const collectDescendantIds = (items: ResourceItem[], rootId: number): Set<number> => {
  const result = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    items.forEach((item) => {
      if (result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
    });
  }
  return result;
};

const PermissionResourcePage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [resourceTree, setResourceTree] = useState<ResourceItem[]>([]);
  const [resourceList, setResourceList] = useState<ResourceItem[]>([]);
  const [editingRecord, setEditingRecord] = useState<ResourceItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(drawerOpen && drawerDirty);
  // 布局在切换页签时会广播激活事件；忽略与首次挂载同一轮触发的事件，避免刚打开页面就请求两次。
  const activationReadyRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      activationReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  usePageActivation(() => {
    if (!activationReadyRef.current) {
      return;
    }
    setReloadToken((current) => current + 1);
  });

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
  }, [reloadToken]);

  const stats = useMemo(
    () => ({
      total: resourceList.length,
      enabled: resourceList.filter((item) => item.enabled).length,
      menus: resourceList.filter((item) => item.type === 'MENU').length,
    }),
    [resourceList],
  );

  const parentOptions = useMemo(() => {
    // 编辑时必须排除当前节点及其全部子孙，否则把父级设成自己的下级会形成环。
    const excludedIds = editingRecord ? collectDescendantIds(resourceList, editingRecord.id) : new Set<number>();
    return [
      { value: 0, label: '顶级资源' },
      ...resourceList
        .filter((item) => item.type === 'MENU' && !excludedIds.has(item.id))
        .map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` })),
    ];
  }, [editingRecord, resourceList]);

  const openCreateDrawer = (parentId?: number) => {
    setEditingRecord(null);
    setDrawerDirty(false);
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
    setDrawerDirty(false);
    form.resetFields();
    form.setFieldsValue({
      parentId: record.parentId ?? 0,
      code: record.code,
      name: record.name,
      type: record.type,
      sortOrder: record.sortOrder ?? 0,
      enabled: record.enabled !== false,
      icon: record.icon,
      path: record.path,
      description: record.description,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    confirmDiscard(drawerDirty, () => {
      setDrawerOpen(false);
      setDrawerDirty(false);
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      await permissionResourceApi.delete(deleteTarget.id);
      message.success('权限资源已删除');
      setDeleteTarget(null);
      await fetchResources();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败，请先清理下级权限资源'));
    } finally {
      setDeleteSubmitting(false);
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
      setDrawerDirty(false);
      setDrawerOpen(false);
      form.resetFields();
      await fetchResources();
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
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="权限资源"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchResources()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
              新建权限
            </Button>
          </Space>
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
          locale={{ emptyText: <ListEmpty emptyText="暂无权限资源，请先新建菜单或接口权限" /> }}
        />
      </Card>

      <Drawer
        title={editingRecord ? '编辑权限资源' : '新建权限资源'}
        open={drawerOpen}
        width={520}
        onClose={closeDrawer}
        destroyOnClose
        extra={(
          <Space>
            <Button onClick={closeDrawer} disabled={saving}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" onValuesChange={() => setDrawerDirty(true)}>
          <Form.Item name="parentId" label="父级资源" rules={[{ required: true, message: '请选择父级资源' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={parentOptions}
              placeholder="输入资源名称或编码搜索"
            />
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
              <InputNumber style={{ width: '100%' }} min={0} precision={0} />
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

      <Modal
        open={Boolean(deleteTarget)}
        title="删除权限资源"
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={deleteSubmitting}
        maskClosable={!deleteSubmitting}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleteTarget(null);
          }
        }}
        onOk={() => void handleConfirmDelete()}
        destroyOnClose
      >
        {deleteTarget ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              确认删除权限资源 <Typography.Text strong>{deleteTarget.name}</Typography.Text>（{deleteTarget.code}）？
            </Typography.Text>
            <Typography.Text>删除后该权限编码会从角色授权和菜单绑定中失效，且不可恢复。</Typography.Text>
            <Typography.Text type="secondary">
              存在下级资源时删除会失败，请先删除或迁移下级资源。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default PermissionResourcePage;
