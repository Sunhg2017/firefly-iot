import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import { EditOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import PageHeader from '../../components/PageHeader';
import { workspaceMenuCustomizationApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

interface PermissionOption {
  permissionCode: string;
  permissionLabel: string;
}

interface MenuNode {
  workspaceScope: 'PLATFORM' | 'TENANT' | string;
  menuKey: string;
  parentMenuKey?: string | null;
  label: string;
  icon?: string | null;
  routePath?: string | null;
  menuType?: 'GROUP' | 'PAGE' | string;
  sortOrder?: number;
  visible?: boolean;
  permissions?: PermissionOption[];
  children?: MenuNode[];
}

interface FormValues {
  label: string;
  parentMenuKey?: string;
  sortOrder?: number;
}

const ROOT_MENU_KEY = '__ROOT__';
const MENU_TREE_REFRESH_EVENT = 'firefly:menu-tree-refresh';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const findNode = (nodes: MenuNode[], menuKey?: string | null): MenuNode | null => {
  if (!menuKey) {
    return null;
  }
  for (const node of nodes) {
    if (node.menuKey === menuKey) {
      return node;
    }
    const child = findNode(node.children ?? [], menuKey);
    if (child) {
      return child;
    }
  }
  return null;
};

const collectDescendantKeys = (node?: MenuNode | null): Set<string> => {
  const result = new Set<string>();
  if (!node) {
    return result;
  }
  const walk = (current: MenuNode) => {
    result.add(current.menuKey);
    (current.children ?? []).forEach(walk);
  };
  walk(node);
  return result;
};

const flattenGroupOptions = (
  nodes: MenuNode[],
  excludedKeys: Set<string>,
  depth = 0,
): Array<{ value: string; label: string }> => {
  const result: Array<{ value: string; label: string }> = [];
  nodes.forEach((node) => {
    if (excludedKeys.has(node.menuKey)) {
      return;
    }
    if (node.menuType !== 'PAGE') {
      result.push({
        value: node.menuKey,
        label: `${'  '.repeat(depth)}${node.label}`,
      });
    }
    if (node.children?.length) {
      result.push(...flattenGroupOptions(node.children, excludedKeys, depth + 1));
    }
  });
  return result;
};

const buildTreeData = (nodes: MenuNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.menuKey,
    title: (
      <Space size={8} wrap>
        <span>{node.label}</span>
        <Tag color={node.menuType === 'PAGE' ? 'blue' : 'default'}>
          {node.menuType === 'PAGE' ? '页面' : '目录'}
        </Tag>
        {node.visible === false ? <Tag>隐藏</Tag> : null}
      </Space>
    ),
    children: node.children?.length ? buildTreeData(node.children) : undefined,
  }));

const WorkspaceMenuCustomizationPage: React.FC = () => {
  const [form] = Form.useForm<FormValues>();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const user = useAuthStore((state) => state.user);
  const canUpdate = hasPermission('menu-customization:update');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuTree, setMenuTree] = useState<MenuNode[]>([]);
  const [selectedMenuKey, setSelectedMenuKey] = useState<string | null>(null);

  const selectedNode = useMemo(() => findNode(menuTree, selectedMenuKey), [menuTree, selectedMenuKey]);
  const currentWorkspaceLabel = useMemo(
    () => (user?.userType === 'SYSTEM_OPS' ? '系统运维空间' : '租户空间'),
    [user?.userType],
  );
  const parentOptions = useMemo(() => {
    const excludedKeys = collectDescendantKeys(selectedNode);
    return [{ value: ROOT_MENU_KEY, label: '顶级目录' }, ...flattenGroupOptions(menuTree, excludedKeys)];
  }, [menuTree, selectedNode]);

  const loadMenuTree = async () => {
    setLoading(true);
    try {
      const response = await workspaceMenuCustomizationApi.currentManageTree();
      const nextTree = (response.data?.data ?? []) as MenuNode[];
      setMenuTree(nextTree);
      setSelectedMenuKey((current) => {
        if (current && findNode(nextTree, current)) {
          return current;
        }
        return nextTree[0]?.menuKey ?? null;
      });
    } catch (error) {
      message.error(getErrorMessage(error, '加载菜单配置失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenuTree();
  }, []);

  const openDrawer = () => {
    if (!selectedNode) {
      return;
    }
    form.setFieldsValue({
      label: selectedNode.label,
      parentMenuKey: selectedNode.parentMenuKey ?? ROOT_MENU_KEY,
      sortOrder: selectedNode.sortOrder ?? 0,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedNode) {
      return;
    }
    try {
      const values = await form.validateFields();
      setSaving(true);
      const response = await workspaceMenuCustomizationApi.updateCurrentMenu(selectedNode.menuKey, {
        label: values.label.trim(),
        parentMenuKey: values.parentMenuKey === ROOT_MENU_KEY ? undefined : values.parentMenuKey,
        sortOrder: values.sortOrder ?? 0,
      });
      const nextTree = (response.data?.data ?? []) as MenuNode[];
      setMenuTree(nextTree);
      setSelectedMenuKey(selectedNode.menuKey);
      setDrawerOpen(false);
      window.dispatchEvent(new Event(MENU_TREE_REFRESH_EVENT));
      message.success('菜单配置已更新');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '保存菜单配置失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedNode) {
      return;
    }
    try {
      const response = await workspaceMenuCustomizationApi.resetCurrentMenu(selectedNode.menuKey);
      const nextTree = (response.data?.data ?? []) as MenuNode[];
      setMenuTree(nextTree);
      setSelectedMenuKey(selectedNode.menuKey);
      window.dispatchEvent(new Event(MENU_TREE_REFRESH_EVENT));
      message.success('已恢复默认菜单配置');
    } catch (error) {
      message.error(getErrorMessage(error, '恢复默认菜单配置失败'));
    }
  };

  return (
    <div>
      <PageHeader
        title="菜单配置"
        description={`先选择${currentWorkspaceLabel}菜单节点，再调整显示名称、层级和排序。`}
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadMenuTree()}>
              刷新
            </Button>
            {selectedNode && canUpdate ? (
              <Button type="primary" icon={<EditOutlined />} onClick={openDrawer}>
                编辑菜单
              </Button>
            ) : null}
          </Space>
        )}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="操作限制"
        description="这里只调整当前空间已授权菜单的名称、层级和排序，不会新增或放大权限。"
      />

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title={`${currentWorkspaceLabel}菜单树`}>
            {loading ? (
              <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin />
              </div>
            ) : menuTree.length > 0 ? (
              <Tree
                blockNode
                defaultExpandAll
                selectedKeys={selectedMenuKey ? [selectedMenuKey] : []}
                treeData={buildTreeData(menuTree)}
                onSelect={(keys) => setSelectedMenuKey((keys[0] as string) || null)}
              />
            ) : (
              <Empty description="当前空间暂无可配置菜单" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title="菜单详情"
            extra={selectedNode && canUpdate ? (
              <Space>
                <Button icon={<EditOutlined />} onClick={openDrawer}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认恢复默认菜单配置？"
                  description="恢复后会回到系统基础菜单的默认名称、层级和排序。"
                  onConfirm={() => void handleReset()}
                >
                  <Button icon={<UndoOutlined />}>恢复默认</Button>
                </Popconfirm>
              </Space>
            ) : null}
          >
            {!selectedNode ? (
              <Empty description="请先从左侧选择一个菜单节点" />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card size="small">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Typography.Text type="secondary">菜单名称</Typography.Text>
                      <div>{selectedNode.label}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">菜单键</Typography.Text>
                      <div>{selectedNode.menuKey}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">菜单类型</Typography.Text>
                      <div>{selectedNode.menuType === 'PAGE' ? '页面' : '目录'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">前端路由</Typography.Text>
                      <div>{selectedNode.routePath || '-'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">父级菜单</Typography.Text>
                      <div>{selectedNode.parentMenuKey || '顶级目录'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">排序</Typography.Text>
                      <div>{selectedNode.sortOrder ?? 0}</div>
                    </Col>
                  </Row>
                </Card>

                <Card
                  size="small"
                  title="绑定权限"
                  extra={<Tag color="blue">{selectedNode.permissions?.length ?? 0} 项</Tag>}
                >
                  {selectedNode.permissions?.length ? (
                    <Space size={[8, 8]} wrap>
                      {selectedNode.permissions.map((permission) => (
                        <Tag key={permission.permissionCode} color="processing">
                          {permission.permissionLabel} ({permission.permissionCode})
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Empty description="当前目录节点不直接绑定权限" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Drawer
        destroyOnClose
        open={drawerOpen}
        width={640}
        title={selectedNode ? `编辑菜单 - ${selectedNode.label}` : '编辑菜单'}
        onClose={() => setDrawerOpen(false)}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
              保存
            </Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="label"
            label="菜单名称"
            rules={[{ required: true, message: '请输入菜单名称' }]}
          >
            <Input maxLength={128} placeholder="请输入菜单显示名称" />
          </Form.Item>
          <Form.Item
            name="parentMenuKey"
            label="父级目录"
            rules={[{ required: true, message: '请选择父级目录' }]}
          >
            <Select options={parentOptions} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default WorkspaceMenuCustomizationPage;
