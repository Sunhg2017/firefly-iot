import React, { useEffect, useMemo, useState } from 'react';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
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
  Statistic,
  Steps,
  Switch,
  Tabs,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import iconMap from '../../config/iconMap';
import PageHeader from '../../components/PageHeader';
import { permissionResourceApi, systemMenuPermissionApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

type WorkspaceScope = 'PLATFORM' | 'TENANT';

interface PermissionOption {
  permissionCode: string;
  permissionLabel: string;
  sortOrder?: number;
}

interface MenuNode {
  workspaceScope: WorkspaceScope;
  menuKey: string;
  parentMenuKey?: string | null;
  label: string;
  icon?: string | null;
  routePath?: string | null;
  menuType?: 'GROUP' | 'PAGE' | string;
  sortOrder?: number;
  visible?: boolean;
  roleCatalogVisible?: boolean;
  permissions?: PermissionOption[];
  children?: MenuNode[];
}

interface PermissionResourceItem {
  id: number;
  code: string;
  name: string;
  type: string;
  enabled?: boolean;
}

interface MenuFormValues {
  workspaceScope: WorkspaceScope;
  parentMenuKey?: string;
  menuKey?: string;
  label?: string;
  icon?: string;
  routePath?: string;
  sortOrder?: number;
  visible?: boolean;
  roleCatalogVisible?: boolean;
  permissionCodes?: string[];
}

const ROOT_MENU_KEY = '__ROOT__';

const workspaceLabels: Record<WorkspaceScope, string> = {
  PLATFORM: '系统运维空间',
  TENANT: '租户业务空间',
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const flattenGroupNodes = (nodes: MenuNode[], depth = 0): Array<{ value: string; label: string }> => {
  const result: Array<{ value: string; label: string }> = [];
  nodes.forEach((node) => {
    if (node.menuType !== 'PAGE') {
      result.push({
        value: node.menuKey,
        label: `${'  '.repeat(depth)}${node.label}`,
      });
    }
    if (node.children?.length) {
      result.push(...flattenGroupNodes(node.children, depth + 1));
    }
  });
  return result;
};

const buildTreeData = (nodes: MenuNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.menuKey,
    title: (
      <Space direction="vertical" size={0}>
        <Space size={8} wrap>
          <span>{node.label}</span>
          <Tag color={node.menuType === 'PAGE' ? 'blue' : 'default'}>
            {node.menuType === 'PAGE' ? '页面' : '目录'}
          </Tag>
          {node.visible === false ? <Tag>隐藏</Tag> : null}
        </Space>
        {node.routePath ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {node.routePath}
          </Typography.Text>
        ) : null}
      </Space>
    ),
    children: node.children?.length ? buildTreeData(node.children) : undefined,
  }));

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

const collectStats = (nodes: MenuNode[]) => {
  let total = 0;
  let pageCount = 0;
  let permissionCount = 0;

  const walk = (items: MenuNode[]) => {
    items.forEach((item) => {
      total += 1;
      if (item.menuType === 'PAGE') {
        pageCount += 1;
      }
      permissionCount += item.permissions?.length ?? 0;
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return { total, pageCount, permissionCount };
};

const SystemMenuPermissionPage: React.FC = () => {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canManage = hasPermission('workspace-menu:update');
  const [form] = Form.useForm<MenuFormValues>();

  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope>('PLATFORM');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [selectedMenuKey, setSelectedMenuKey] = useState<string | null>(null);
  const [menuTree, setMenuTree] = useState<MenuNode[]>([]);
  const [permissionResources, setPermissionResources] = useState<PermissionResourceItem[]>([]);

  const selectedNode = useMemo(() => findNode(menuTree, selectedMenuKey), [menuTree, selectedMenuKey]);
  const stats = useMemo(() => collectStats(menuTree), [menuTree]);
  const parentOptions = useMemo(
    () => [{ value: ROOT_MENU_KEY, label: '顶级目录' }, ...flattenGroupNodes(menuTree)],
    [menuTree],
  );
  const permissionOptions = useMemo(
    () => permissionResources
      .filter((item) => item.enabled !== false && item.code.includes(':'))
      .map((item) => ({ value: item.code, label: `${item.name} (${item.code})` })),
    [permissionResources],
  );
  const iconOptions = useMemo(
    () => Object.entries(iconMap)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, icon]) => ({
        value,
        label: (
          <Space size={8}>
            <span>{icon}</span>
            <span>{value}</span>
          </Space>
        ),
      })),
    [],
  );
  const routePath = Form.useWatch('routePath', form);
  const selectedPermissionCodes = Form.useWatch('permissionCodes', form) ?? [];

  const loadMenuTree = async (scope = workspaceScope) => {
    setLoading(true);
    try {
      const [treeRes, permissionRes] = await Promise.all([
        systemMenuPermissionApi.tree(scope),
        permissionResourceApi.list(),
      ]);
      const nextTree = (treeRes.data?.data ?? []) as MenuNode[];
      setMenuTree(nextTree);
      setPermissionResources((permissionRes.data?.data ?? []) as PermissionResourceItem[]);
      if (!selectedMenuKey && nextTree.length > 0) {
        setSelectedMenuKey(nextTree[0].menuKey);
      } else if (selectedMenuKey && !findNode(nextTree, selectedMenuKey)) {
        setSelectedMenuKey(nextTree[0]?.menuKey ?? null);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载系统菜单权限失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenuTree(workspaceScope);
  }, [workspaceScope]);

  const openCreateDrawer = (parentMenuKey?: string) => {
    setDrawerMode('create');
    setStepIndex(0);
    form.resetFields();
    form.setFieldsValue({
      workspaceScope,
      parentMenuKey: parentMenuKey ?? ROOT_MENU_KEY,
      sortOrder: 0,
      visible: true,
      roleCatalogVisible: true,
      permissionCodes: [],
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (node: MenuNode) => {
    setDrawerMode('edit');
    setStepIndex(0);
    form.setFieldsValue({
      workspaceScope: node.workspaceScope,
      parentMenuKey: node.parentMenuKey ?? ROOT_MENU_KEY,
      menuKey: node.menuKey,
      label: node.label,
      icon: node.icon ?? undefined,
      routePath: node.routePath ?? undefined,
      sortOrder: node.sortOrder ?? 0,
      visible: node.visible !== false,
      roleCatalogVisible: node.roleCatalogVisible !== false,
      permissionCodes: (node.permissions ?? []).map((item) => item.permissionCode),
    });
    setDrawerOpen(true);
  };

  const handleDelete = async (node: MenuNode) => {
    try {
      await systemMenuPermissionApi.deleteMenu(workspaceScope, node.menuKey);
      message.success('菜单已删除');
      setSelectedMenuKey(null);
      await loadMenuTree(workspaceScope);
    } catch (error) {
      message.error(getErrorMessage(error, '删除菜单失败'));
    }
  };

  const handleNextStep = async () => {
    await form.validateFields(['workspaceScope', 'parentMenuKey', 'menuKey', 'label', 'icon', 'sortOrder']);
    setStepIndex(1);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        workspaceScope: values.workspaceScope,
        parentMenuKey: values.parentMenuKey === ROOT_MENU_KEY ? undefined : values.parentMenuKey,
        menuKey: values.menuKey?.trim(),
        label: values.label?.trim(),
        icon: values.icon?.trim() || undefined,
        routePath: values.routePath?.trim() || undefined,
        sortOrder: values.sortOrder ?? 0,
        visible: values.visible !== false,
        roleCatalogVisible: values.routePath ? values.roleCatalogVisible !== false : false,
      };

      setSaving(true);
      if (drawerMode === 'create') {
        await systemMenuPermissionApi.createMenu(payload);
      } else if (values.menuKey) {
        await systemMenuPermissionApi.updateMenu(values.workspaceScope, values.menuKey, payload);
      }

      if (values.menuKey) {
        await systemMenuPermissionApi.replacePermissions(values.menuKey, {
          workspaceScope: values.workspaceScope,
          permissionCodes: payload.routePath ? (values.permissionCodes ?? []) : [],
        });
      }

      message.success(drawerMode === 'create' ? '菜单已创建' : '菜单已更新');
      setDrawerOpen(false);
      await loadMenuTree(values.workspaceScope);
      if (values.menuKey) {
        setSelectedMenuKey(values.menuKey);
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '保存系统菜单权限失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="系统菜单权限管理"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadMenuTree()}>
              刷新
            </Button>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
                新建菜单
              </Button>
            ) : null}
          </Space>
        )}
      />

      <Tabs
        activeKey={workspaceScope}
        onChange={(key) => setWorkspaceScope(key as WorkspaceScope)}
        items={[
          { key: 'PLATFORM', label: workspaceLabels.PLATFORM },
          { key: 'TENANT', label: workspaceLabels.TENANT },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="菜单节点" value={stats.total} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="页面节点" value={stats.pageCount} prefix={<SafetyOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="绑定权限数" value={stats.permissionCount} prefix={<SafetyOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card
            title={`${workspaceLabels[workspaceScope]}菜单树`}
            extra={selectedNode && canManage ? (
              <Button
                size="small"
                onClick={() => openCreateDrawer(
                  selectedNode.menuType === 'PAGE' ? selectedNode.parentMenuKey ?? undefined : selectedNode.menuKey,
                )}
              >
                新建下级
              </Button>
            ) : null}
          >
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
              <Empty description="当前空间还没有菜单配置" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title="菜单详情"
            extra={selectedNode && canManage ? (
              <Space>
                <Button icon={<EditOutlined />} onClick={() => openEditDrawer(selectedNode)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该菜单及其下级？"
                  description="删除后会同步清理菜单权限绑定，以及租户已授权菜单记录。"
                  onConfirm={() => void handleDelete(selectedNode)}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ) : null}
          >
            {!selectedNode ? (
              <Empty description="请选择左侧菜单节点" />
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
                      <Typography.Text type="secondary">路由入口</Typography.Text>
                      <div>{selectedNode.routePath || '-'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">图标</Typography.Text>
                      <div>{selectedNode.icon || '-'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">排序</Typography.Text>
                      <div>{selectedNode.sortOrder ?? 0}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">是否显示</Typography.Text>
                      <div>{selectedNode.visible === false ? '否' : '是'}</div>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary">角色目录展示</Typography.Text>
                      <div>{selectedNode.roleCatalogVisible === false ? '否' : '是'}</div>
                    </Col>
                  </Row>
                </Card>

                <Card
                  size="small"
                  title="权限集合"
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
                    <Empty description="当前菜单还没有绑定权限" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Drawer
        destroyOnClose
        title={drawerMode === 'create' ? '新建基础菜单' : `编辑基础菜单 - ${selectedNode?.label ?? ''}`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Space>
              {stepIndex > 0 ? (
                <Button onClick={() => setStepIndex((current) => current - 1)}>
                  上一步
                </Button>
              ) : null}
              {stepIndex === 0 ? (
                <Button type="primary" onClick={() => void handleNextStep()}>
                  下一步
                </Button>
              ) : (
                <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
                  保存
                </Button>
              )}
            </Space>
          </Space>
        )}
      >
        <Steps
          current={stepIndex}
          items={[
            { title: '菜单信息' },
            { title: '权限集合' },
          ]}
          style={{ marginBottom: 24 }}
        />

        <Form form={form} layout="vertical" preserve={false}>
          {stepIndex === 0 ? (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="workspaceScope" label="所属空间" rules={[{ required: true, message: '请选择所属空间' }]}>
                  <Select
                    disabled={drawerMode === 'edit'}
                    options={Object.entries(workspaceLabels).map(([value, label]) => ({ value, label }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="parentMenuKey" label="父级目录" rules={[{ required: true, message: '请选择父级目录' }]}>
                  <Select options={parentOptions} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="menuKey"
                  label="菜单唯一键"
                  rules={[
                    { required: true, message: '请输入菜单唯一键' },
                    { pattern: /^[A-Za-z0-9:_/-]{2,128}$/, message: '菜单唯一键仅支持字母、数字、冒号、下划线、中划线和斜杠' },
                  ]}
                >
                  <Input disabled={drawerMode === 'edit'} placeholder="例如 system-menu-permission" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="label" label="菜单名称" rules={[{ required: true, message: '请输入菜单名称' }]}>
                  <Input placeholder="请输入菜单名称" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="icon" label="菜单图标" rules={[{ required: true, message: '请选择菜单图标' }]}>
                  <Select
                    showSearch
                    placeholder="请选择菜单图标"
                    optionFilterProp="value"
                    filterOption={(input, option) =>
                      String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={iconOptions}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="routePath" label="前端路由">
                  <Input placeholder="目录节点留空，例如 /system-menu-permission" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="sortOrder" label="排序">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Space size={24} style={{ marginTop: 30 }}>
                  <Form.Item name="visible" label="显示" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
                  </Form.Item>
                  <Form.Item name="roleCatalogVisible" label="角色目录展示" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="展示" unCheckedChildren="隐藏" disabled={!routePath} />
                  </Form.Item>
                </Space>
              </Col>
            </Row>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message={routePath ? '为当前页面绑定可分配权限' : '目录节点无需绑定权限'}
                description={
                  routePath
                    ? '角色授权页面会基于这里绑定的权限集合生成目录。若页面无需单独授权，可以留空。'
                    : '当前节点是目录节点，只负责组织菜单层级，不直接承载权限集合。'
                }
              />

              {routePath ? (
                <Card
                  size="small"
                  title="权限编码"
                  extra={<Typography.Text type="secondary">已选 {selectedPermissionCodes.length} 项</Typography.Text>}
                >
                  <Form.Item name="permissionCodes" noStyle>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      maxTagCount="responsive"
                      placeholder="请选择当前菜单可分配的权限编码"
                      options={permissionOptions}
                    />
                  </Form.Item>
                </Card>
              ) : (
                <Empty description="目录节点无需配置权限" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Space>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

export default SystemMenuPermissionPage;
