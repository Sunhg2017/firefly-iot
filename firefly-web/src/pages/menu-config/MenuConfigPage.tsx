import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Button, Tree, Space, Modal, Form, Input, InputNumber, Switch,
  Select, message, Typography, Popconfirm, Empty, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { tenantMenuConfigApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import { isRouteGroup, type RouteNode } from '../../config/routes';
import { filterWorkspaceRoutes, resolveWorkspaceByUserType, type WorkspaceType } from '../../config/workspaceRoutes';
import iconMap, { getIcon } from '../../config/iconMap';
import type { DataNode } from 'antd/es/tree';
import useAuthStore from '../../store/useAuthStore';

interface MenuConfigItem {
  id: number;
  parentId: number;
  menuKey: string;
  label: string;
  icon: string | null;
  routePath: string | null;
  sortOrder: number;
  visible: boolean;
  children?: MenuConfigItem[];
}

/** 收集所有可用的路由路径 */
const iconOptions = Object.keys(iconMap).map((key) => ({
  label: key,
  value: key,
}));

const MenuConfigPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [treeData, setTreeData] = useState<MenuConfigItem[]>([]);
  const [flatList, setFlatList] = useState<MenuConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuConfigItem | null>(null);
  const [form] = Form.useForm();
  const workspace = resolveWorkspaceByUserType(user?.userType) as WorkspaceType;
  const workspaceLabel = workspace === 'platform' ? '系统运维空间' : '租户业务空间';
  const workspaceRouteConfigs = useMemo(() => filterWorkspaceRoutes(workspace), [workspace]);
  const flattenRouteOptions = (nodes: RouteNode[], parents: string[] = []): { label: string; value: string }[] => {
    const options: { label: string; value: string }[] = [];
    nodes.forEach((node) => {
      if (isRouteGroup(node)) {
        options.push(...flattenRouteOptions(node.children, [...parents, node.label]));
        return;
      }
      options.push({
        label: `${[...parents, node.label].join(' / ')} (${node.path})`,
        value: node.path,
      });
    });
    return options;
  };
  const routePathOptions = useMemo(() => {
    return flattenRouteOptions(workspaceRouteConfigs);
  }, [workspaceRouteConfigs]);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantMenuConfigApi.tree();
      setTreeData(res.data.data ?? []);
      const listRes = await tenantMenuConfigApi.list();
      setFlatList(listRes.data.data ?? []);
    } catch {
      setTreeData([]);
      setFlatList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const convertToTreeData = (items: MenuConfigItem[]): DataNode[] => {
    return items.map((item) => ({
      key: String(item.id),
      title: (
        <Space size={8}>
          {getIcon(item.icon)}
          <span style={{ opacity: item.visible ? 1 : 0.4 }}>
            {item.label}
            {item.routePath && (
              <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                {item.routePath}
              </Typography.Text>
            )}
          </span>
          {!item.visible && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>(隐藏)</Typography.Text>
          )}
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此菜单？子菜单也将一并删除"
            onConfirm={() => handleDelete(item.id)}
          >
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
      children: item.children ? convertToTreeData(item.children) : undefined,
    }));
  };

  const handleEdit = (item: MenuConfigItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      parentId: item.parentId === 0 ? null : item.parentId,
      menuKey: item.menuKey,
      label: item.label,
      icon: item.icon,
      routePath: item.routePath,
      sortOrder: item.sortOrder,
      visible: item.visible,
    });
    setModalOpen(true);
  };

  const handleAdd = (parentId?: number) => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      parentId: parentId || null,
      sortOrder: 0,
      visible: true,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await tenantMenuConfigApi.delete(id);
      message.success('删除成功');
      fetchTree();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        parentId: values.parentId || 0,
      };

      if (editingItem) {
        await tenantMenuConfigApi.update(editingItem.id, data);
        message.success('更新成功');
      } else {
        await tenantMenuConfigApi.create(data);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchTree();
    } catch {
      // validation error
    }
  };

  const handleInitDefaults = async () => {
    Modal.confirm({
      title: '初始化默认菜单',
      content: '将清除当前所有自定义菜单配置，并从系统默认菜单模板重新生成。确定继续？',
      onOk: async () => {
        try {
          const defaults: Record<string, unknown>[] = [];
          const appendDefaults = (nodes: RouteNode[], parentMenuKey?: string) => {
            nodes.forEach((node, index) => {
              if (isRouteGroup(node)) {
                // Keep the default menu template aligned with the recursive route tree,
                // otherwise re-initializing tenant menus would collapse nested groups.
                defaults.push({
                  menuKey: node.key,
                  label: node.label,
                  icon: guessIconName(node.icon),
                  routePath: null,
                  parentMenuKey,
                  sortOrder: index,
                  visible: true,
                });
                appendDefaults(node.children, node.key);
                return;
              }

              defaults.push({
                menuKey: node.path,
                label: node.label,
                icon: guessIconName(node.icon),
                routePath: node.path,
                parentMenuKey,
                sortOrder: index,
                visible: true,
              });
            });
          };

          appendDefaults(workspaceRouteConfigs);

          await tenantMenuConfigApi.initDefaults(defaults);
          message.success('默认菜单已初始化，请刷新页面查看');
          fetchTree();
        } catch {
          message.error('初始化失败');
        }
      },
    });
  };

  /** 拖拽排序处理 */
  const handleDrop = async (info: {
    node: DataNode;
    dragNode: DataNode;
    dropPosition: number;
    dropToGap: boolean;
  }) => {
    const dragId = Number(info.dragNode.key);
    const dropId = Number(info.node.key);
    const dropItem = flatList.find((i) => i.id === dropId);
    if (!dropItem) return;

    // 计算新的 parentId 和 sortOrder
    let newParentId: number;
    let newSortOrder: number;

    if (info.dropToGap) {
      newParentId = dropItem.parentId;
      newSortOrder = info.dropPosition;
    } else {
      newParentId = dropId;
      newSortOrder = 0;
    }

    try {
      await tenantMenuConfigApi.batchSort([
        { id: dragId, parentId: newParentId, sortOrder: newSortOrder },
      ]);
      message.success('排序已更新');
      fetchTree();
    } catch {
      message.error('排序失败');
    }
  };

  const parentOptions = flatList
    .filter((i) => !i.routePath)
    .map((i) => ({ label: i.label, value: i.id }));

  return (
    <div>
      <PageHeader title={`${workspaceLabel}菜单管理`} description={`维护${workspaceLabel}的菜单展示、顺序与层级`} />
      <Card
        loading={loading}
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchTree}>
              刷新
            </Button>
            <Button icon={<SaveOutlined />} onClick={handleInitDefaults}>
              初始化默认菜单
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>
              新增菜单
            </Button>
          </Space>
        }
      >
        {treeData.length > 0 ? (
          <Tree
            draggable
            blockNode
            showLine
            defaultExpandAll
            treeData={convertToTreeData(treeData)}
            onDrop={handleDrop as never}
          />
        ) : (
          <Empty
            description={
              <span>
                暂无自定义菜单配置，当前使用系统默认菜单。
                <Button type="link" onClick={handleInitDefaults}>
                  点击初始化
                </Button>
              </span>
            }
          />
        )}
      </Card>

      <Modal
        title={editingItem ? '编辑菜单' : '新增菜单'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="父菜单">
            <Select
              allowClear
              placeholder="无（顶级菜单）"
              options={parentOptions}
            />
          </Form.Item>
          <Form.Item
            name="menuKey"
            label="菜单标识"
            rules={[{ required: true, message: '请输入菜单标识' }]}
          >
            <Input placeholder="如 system-mgmt 或 /dashboard" disabled={!!editingItem} />
          </Form.Item>
          <Form.Item
            name="label"
            label="菜单名称"
            rules={[{ required: true, message: '请输入菜单名称' }]}
          >
            <Input placeholder="如 系统管理" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Select
              allowClear
              showSearch
              placeholder="选择图标"
              options={iconOptions}
              optionRender={(option) => (
                <Space>
                  {getIcon(option.value as string)}
                  <span>{option.label}</span>
                </Space>
              )}
            />
          </Form.Item>
          <Form.Item name="routePath" label="路由路径">
            <Select
              allowClear
              showSearch
              placeholder="分组菜单留空"
              options={routePathOptions}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序序号">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="visible" label="是否显示" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

/** 尝试从 React 元素的 type 中推断 icon 名称 */
function guessIconName(icon: React.ReactNode): string | null {
  if (!icon || typeof icon !== 'object') return null;
  const el = icon as React.ReactElement;
  if (el.type && typeof el.type === 'object' && 'displayName' in el.type) {
    return (el.type as { displayName?: string }).displayName || null;
  }
  if (el.type && typeof el.type === 'function') {
    return (el.type as { displayName?: string }).displayName || el.type.name || null;
  }
  return null;
}

export default MenuConfigPage;
