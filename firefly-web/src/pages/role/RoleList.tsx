import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { deviceGroupApi, projectApi, roleApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

interface RoleDataScopeConfig {
  projectIds?: number[];
  groupIds?: string[];
}

interface RoleRecord {
  id: number;
  code: string;
  name: string;
  description?: string;
  type: 'PRESET' | 'CUSTOM' | string;
  dataScope: 'ALL' | 'PROJECT' | 'GROUP' | 'SELF' | 'CUSTOM' | string;
  dataScopeConfig?: RoleDataScopeConfig;
  systemFlag: boolean;
  status: 'ACTIVE' | 'DISABLED' | string;
  permissions?: string[];
  userCount?: number;
  createdAt?: string;
}

interface PermissionOption {
  code: string;
  label: string;
}

interface PermissionGroup {
  key: string;
  label: string;
  routePath?: string;
  permissions: PermissionOption[];
}

interface ProjectOption {
  id: number;
  code: string;
  name: string;
}

interface DeviceGroupOption {
  id: number;
  name: string;
  parentId?: number | null;
}

interface QueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  type?: string;
}

interface RoleFormValues {
  code?: string;
  name?: string;
  description?: string;
  dataScope?: string;
  dataScopeConfig?: RoleDataScopeConfig;
  permissions?: string[];
}

const roleTypeLabels: Record<string, string> = {
  PRESET: '内置角色',
  CUSTOM: '自定义角色',
};

const dataScopeLabels: Record<string, string> = {
  ALL: '全部数据',
  PROJECT: '项目范围',
  GROUP: '分组范围',
  SELF: '仅本人',
  CUSTOM: '自定义范围',
};

const statusLabels: Record<string, string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const RoleList: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [queryForm] = Form.useForm();
  const [form] = Form.useForm<RoleFormValues>();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [items, setItems] = useState<RoleRecord[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<DeviceGroupOption[]>([]);
  const [scopeOptionsLoading, setScopeOptionsLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState<QueryState>({ pageNum: 1, pageSize: 20 });

  const fetchRoles = async (nextParams = params) => {
    setLoading(true);
    try {
      const res = await roleApi.list(nextParams as unknown as Record<string, unknown>);
      const page = res.data?.data ?? {};
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载角色列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionGroups = async () => {
    try {
      const res = await roleApi.permissionGroups();
      setPermissionGroups((res.data?.data ?? []) as PermissionGroup[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载可分配权限失败'));
    }
  };

  const fetchScopeOptions = async () => {
    setScopeOptionsLoading(true);
    try {
      const [projectRes, groupRes] = await Promise.all([
        projectApi.list({ pageNum: 1, pageSize: 500 }),
        deviceGroupApi.listAll(),
      ]);
      setProjectOptions((projectRes.data?.data?.records ?? []) as ProjectOption[]);
      setGroupOptions((groupRes.data?.data ?? []) as DeviceGroupOption[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载数据范围选项失败'));
    } finally {
      setScopeOptionsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoles();
  }, [params.pageNum, params.pageSize]);

  useEffect(() => {
    void fetchPermissionGroups();
    void fetchScopeOptions();
  }, []);

  const stats = useMemo(
    () => ({
      system: items.filter((item) => item.systemFlag).length,
      custom: items.filter((item) => !item.systemFlag).length,
      active: items.filter((item) => item.status === 'ACTIVE').length,
    }),
    [items],
  );

  const allPermissionCodes = useMemo(
    () => permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.code)),
    [permissionGroups],
  );

  const selectedPermissionCount = Form.useWatch('permissions', form)?.length ?? 0;
  const selectedDataScope = Form.useWatch('dataScope', form);

  const projectLabelMap = useMemo(
    () => new Map(projectOptions.map((item) => [item.id, `${item.name}${item.code ? ` (${item.code})` : ''}`])),
    [projectOptions],
  );

  const groupSelectOptions = useMemo(() => {
    const byId = new Map(groupOptions.map((item) => [item.id, item]));
    const buildLabel = (groupId: number): string => {
      const labels: string[] = [];
      let current = byId.get(groupId);
      let depth = 0;
      while (current && depth < 10) {
        labels.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
        depth += 1;
      }
      return labels.join(' / ');
    };
    return groupOptions.map((item) => ({
      value: String(item.id),
      label: buildLabel(item.id),
    }));
  }, [groupOptions]);

  const groupLabelMap = useMemo(
    () => new Map(groupSelectOptions.map((item) => [item.value, String(item.label)])),
    [groupSelectOptions],
  );

  const summarizeScopeTargets = (config?: RoleDataScopeConfig): string[] => {
    if (!config) {
      return [];
    }
    const projectLabels = (config.projectIds ?? [])
      .map((projectId) => projectLabelMap.get(projectId))
      .filter((item): item is string => Boolean(item))
      .map((label) => `项目: ${label}`);
    const groupLabels = (config.groupIds ?? [])
      .map((groupId) => groupLabelMap.get(groupId))
      .filter((item): item is string => Boolean(item))
      .map((label) => `分组: ${label}`);
    return [...projectLabels, ...groupLabels];
  };

  const validateDataScopeConfig = async () => {
    const scope = form.getFieldValue('dataScope') as string | undefined;
    const config = (form.getFieldValue('dataScopeConfig') ?? {}) as RoleDataScopeConfig;
    const projectIds = config.projectIds ?? [];
    const groupIds = config.groupIds ?? [];
    form.setFields([
      { name: ['dataScopeConfig', 'projectIds'], errors: [] },
      { name: ['dataScopeConfig', 'groupIds'], errors: [] },
    ]);

    if (scope === 'PROJECT' && projectIds.length === 0) {
      form.setFields([{ name: ['dataScopeConfig', 'projectIds'], errors: ['请选择至少一个项目'] }]);
      throw new Error('project-scope-required');
    }
    if (scope === 'GROUP' && groupIds.length === 0) {
      form.setFields([{ name: ['dataScopeConfig', 'groupIds'], errors: ['请选择至少一个分组'] }]);
      throw new Error('group-scope-required');
    }
    if (scope === 'CUSTOM' && projectIds.length === 0 && groupIds.length === 0) {
      form.setFields([
        { name: ['dataScopeConfig', 'projectIds'], errors: ['请至少选择一个项目或分组'] },
        { name: ['dataScopeConfig', 'groupIds'], errors: ['请至少选择一个项目或分组'] },
      ]);
      throw new Error('custom-scope-required');
    }
  };

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    const nextParams: QueryState = {
      ...params,
      pageNum: 1,
      keyword: values.keyword?.trim() || undefined,
      status: values.status || undefined,
      type: values.type || undefined,
    };
    setParams(nextParams);
    void fetchRoles(nextParams);
  };

  const handleReset = () => {
    queryForm.resetFields();
    const nextParams: QueryState = { pageNum: 1, pageSize: params.pageSize };
    setParams(nextParams);
    void fetchRoles(nextParams);
  };

  const openCreateDrawer = () => {
    setEditingRole(null);
    setStepIndex(0);
    form.resetFields();
    form.setFieldsValue({
      dataScope: 'PROJECT',
      dataScopeConfig: { projectIds: [], groupIds: [] },
      permissions: [],
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = async (record: RoleRecord) => {
    try {
      const res = await roleApi.get(record.id);
      const detail = (res.data?.data ?? record) as RoleRecord;
      setEditingRole(detail);
      setStepIndex(0);
      form.setFieldsValue({
        code: detail.code,
        name: detail.name,
        description: detail.description,
        dataScope: detail.dataScope,
        dataScopeConfig: {
          projectIds: detail.dataScopeConfig?.projectIds ?? [],
          groupIds: detail.dataScopeConfig?.groupIds ?? [],
        },
        permissions: detail.permissions ?? [],
      });
      setDrawerOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载角色详情失败'));
    }
  };

  const handleDelete = async (record: RoleRecord) => {
    try {
      await roleApi.delete(record.id);
      message.success('角色已删除');
      void fetchRoles({ ...params, pageNum: 1 });
    } catch (error) {
      message.error(getErrorMessage(error, '删除角色失败'));
    }
  };

  const handleDataScopeChange = (scope: string) => {
    const currentConfig = (form.getFieldValue('dataScopeConfig') ?? {}) as RoleDataScopeConfig;
    if (scope === 'ALL' || scope === 'SELF') {
      form.setFieldValue('dataScopeConfig', undefined);
      return;
    }
    form.setFieldValue('dataScopeConfig', {
      projectIds: currentConfig.projectIds ?? [],
      groupIds: currentConfig.groupIds ?? [],
    });
  };

  const handleNextStep = async () => {
    if (stepIndex === 0) {
      await form.validateFields(['code', 'name', 'dataScope']);
      await validateDataScopeConfig();
      setStepIndex(1);
      return;
    }

    if (stepIndex === 1) {
      const permissions = form.getFieldValue('permissions') as string[] | undefined;
      if (!Array.isArray(permissions) || permissions.length === 0) {
        message.error('请至少选择一项权限');
        return;
      }
      setStepIndex(2);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await validateDataScopeConfig();
      const payload = {
        code: values.code?.trim(),
        name: values.name?.trim(),
        description: values.description?.trim() || undefined,
        dataScope: values.dataScope,
        dataScopeConfig: values.dataScope === 'ALL' || values.dataScope === 'SELF'
          ? undefined
          : {
              projectIds: values.dataScopeConfig?.projectIds ?? [],
              groupIds: (values.dataScopeConfig?.groupIds ?? []).map((groupId) => String(groupId)),
            },
        permissions: values.permissions ?? [],
      };

      setSaving(true);
      if (editingRole) {
        await roleApi.update(editingRole.id, payload);
        message.success('角色已更新');
      } else {
        await roleApi.create(payload);
        message.success('角色已创建');
      }
      setDrawerOpen(false);
      form.resetFields();
      void fetchRoles({ ...params, pageNum: 1 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      if (error instanceof Error && error.message.endsWith('-required')) {
        return;
      }
      message.error(getErrorMessage(error, '保存角色失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<RoleRecord> = [
    {
      title: '角色',
      dataIndex: 'name',
      width: 240,
      render: (_value: string, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Tag color={record.systemFlag ? 'gold' : 'blue'}>
              {record.systemFlag ? '系统角色' : roleTypeLabels[record.type] || record.type}
            </Tag>
            <Tag color={record.status === 'ACTIVE' ? 'success' : 'default'}>
              {statusLabels[record.status] || record.status}
            </Tag>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.code}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '数据范围',
      dataIndex: 'dataScope',
      width: 160,
      render: (_value: string, record) => {
        const details = summarizeScopeTargets(record.dataScopeConfig);
        return (
          <Space direction="vertical" size={4}>
            <span>{dataScopeLabels[record.dataScope] || record.dataScope}</span>
            {details.length > 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {details.slice(0, 2).join('；')}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '权限数',
      dataIndex: 'permissions',
      width: 120,
      render: (value?: string[]) => value?.length ?? 0,
    },
    {
      title: '成员数',
      dataIndex: 'userCount',
      width: 120,
      render: (value?: number) => value ?? 0,
    },
    {
      title: '说明',
      dataIndex: 'description',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" disabled={record.systemFlag} onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger disabled={record.systemFlag} onClick={() => void handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const stepItems = [
    { title: '基本信息' },
    { title: '权限配置' },
    { title: '确认提交' },
  ];

  const summaryValues = form.getFieldsValue();
  const summaryScopeTargets = summarizeScopeTargets(summaryValues.dataScopeConfig);

  return (
    <div>
      <PageHeader
        title="角色管理"
        description={
          currentUser?.userType === 'SYSTEM_OPS'
            ? '系统运维空间下创建的角色只能分配系统运维功能权限。'
            : '租户空间下创建的角色只能分配当前租户已授权的空间权限。'
        }
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            新建角色
          </Button>
        )}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="授权规则"
        description={
          currentUser?.userType === 'SYSTEM_OPS'
            ? '系统运维角色仅可授权系统运维空间能力；租户业务能力不会出现在这里。'
            : '租户角色的可选权限由“租户管理 > 空间授权”决定，未授权的模块不会出现在这里。'
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="角色总数" value={total} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="系统角色" value={stats.system} prefix={<LockOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="启用角色" value={stats.active} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="角色编码 / 角色名称" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="type" label="角色类型">
            <Select
              allowClear
              placeholder="全部类型"
              style={{ width: 160 }}
              options={Object.entries(roleTypeLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 160 }}
              options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<RoleRecord>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: 1180 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (pageNum, pageSize) => {
              setParams((prev) => ({ ...prev, pageNum, pageSize }));
            },
          }}
        />
      </Card>

      <Drawer
        destroyOnClose
        title={editingRole ? `编辑角色 - ${editingRole.name}` : '新建角色'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={960}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Space>
              {stepIndex > 0 && (
                <Button onClick={() => setStepIndex((current) => current - 1)}>
                  上一步
                </Button>
              )}
              {stepIndex < stepItems.length - 1 ? (
                <Button type="primary" onClick={() => void handleNextStep()}>
                  下一步
                </Button>
              ) : (
                <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                  保存角色
                </Button>
              )}
            </Space>
          </Space>
        )}
      >
        <Steps current={stepIndex} items={stepItems} style={{ marginBottom: 24 }} />

        <Form form={form} layout="vertical" preserve={false}>
          {stepIndex === 0 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="code"
                  label="角色编码"
                  rules={[
                    { required: true, message: '请输入角色编码' },
                    { max: 64, message: '角色编码长度不能超过 64 位' },
                    { pattern: /^[A-Za-z0-9:_-]{2,64}$/, message: '角色编码仅支持字母、数字、冒号、中划线和下划线' },
                  ]}
                >
                  <Input placeholder="例如 tenant_operator" disabled={!!editingRole} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="角色名称"
                  rules={[
                    { required: true, message: '请输入角色名称' },
                    { max: 128, message: '角色名称长度不能超过 128 位' },
                  ]}
                >
                  <Input placeholder="例如 租户运维" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="dataScope"
                  label="数据范围"
                  rules={[{ required: true, message: '请选择数据范围' }]}
                >
                  <Select
                    onChange={handleDataScopeChange}
                    options={Object.entries(dataScopeLabels).map(([value, label]) => ({ value, label }))}
                  />
                </Form.Item>
              </Col>
              {(selectedDataScope === 'PROJECT' || selectedDataScope === 'CUSTOM') && (
                <Col span={24}>
                  <Form.Item name={['dataScopeConfig', 'projectIds']} label="项目范围">
                    <Select
                      mode="multiple"
                      allowClear
                      loading={scopeOptionsLoading}
                      placeholder={selectedDataScope === 'PROJECT' ? '请选择允许访问的项目' : '可选，不选则仅按分组控制'}
                      options={projectOptions.map((item) => ({
                        value: item.id,
                        label: `${item.name}${item.code ? ` (${item.code})` : ''}`,
                      }))}
                    />
                  </Form.Item>
                </Col>
              )}
              {(selectedDataScope === 'GROUP' || selectedDataScope === 'CUSTOM') && (
                <Col span={24}>
                  <Form.Item name={['dataScopeConfig', 'groupIds']} label="分组范围">
                    <Select
                      mode="multiple"
                      allowClear
                      loading={scopeOptionsLoading}
                      placeholder={selectedDataScope === 'GROUP' ? '请选择允许访问的设备分组' : '可选，不选则仅按项目控制'}
                      options={groupSelectOptions}
                    />
                  </Form.Item>
                </Col>
              )}
              {selectedDataScope === 'CUSTOM' && (
                <Col span={24}>
                  <Alert
                    type="info"
                    showIcon
                    message="自定义范围"
                    description="自定义范围会合并项目和设备分组，统一收口为该角色在设备、产品、告警、规则、OTA、视频等模块中的可见范围。"
                  />
                </Col>
              )}
              <Col span={24}>
                <Form.Item name="description" label="角色说明">
                  <Input.TextArea rows={4} placeholder="可选，用于说明该角色的职责边界" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {stepIndex === 1 && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="权限选择"
                description="模块过多时使用步骤式配置。每个模块只展示当前空间真实可分配的权限项，越权能力不会出现在这里。"
              />

              <Card
                size="small"
                title="快速操作"
                extra={(
                  <Space>
                    <Typography.Text type="secondary">
                      已选 {selectedPermissionCount} 项
                    </Typography.Text>
                    <Button size="small" onClick={() => form.setFieldValue('permissions', allPermissionCodes)}>
                      全选
                    </Button>
                    <Button size="small" onClick={() => form.setFieldValue('permissions', [])}>
                      清空
                    </Button>
                  </Space>
                )}
              >
                <Typography.Text type="secondary">
                  如果只想赋予查看权限，可以只勾选各模块中的“查看”类权限；需要完整运维能力时，再继续勾选编辑、删除、处理等权限。
                </Typography.Text>
              </Card>

              <Form.Item name="permissions" noStyle>
                <div>
                  <Row gutter={[16, 16]}>
                    {permissionGroups.map((group) => {
                      const selectedPermissions = (form.getFieldValue('permissions') as string[] | undefined) ?? [];
                      const groupCodes = group.permissions.map((permission) => permission.code);
                      const checkedCount = groupCodes.filter((code) => selectedPermissions.includes(code)).length;
                      const allChecked = checkedCount === groupCodes.length && groupCodes.length > 0;
                      const partiallyChecked = checkedCount > 0 && checkedCount < groupCodes.length;

                      return (
                        <Col span={12} key={group.key}>
                          <Card
                            size="small"
                            title={group.label}
                            extra={(
                              <Checkbox
                                checked={allChecked}
                                indeterminate={partiallyChecked}
                                onChange={(event) => {
                                  const nextSelected = new Set(selectedPermissions);
                                  if (event.target.checked) {
                                    groupCodes.forEach((code) => nextSelected.add(code));
                                  } else {
                                    groupCodes.forEach((code) => nextSelected.delete(code));
                                  }
                                  form.setFieldValue('permissions', [...nextSelected]);
                                }}
                              >
                                全选
                              </Checkbox>
                            )}
                          >
                            {group.routePath && (
                              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                页面入口：{group.routePath}
                              </Typography.Text>
                            )}
                            <Checkbox.Group
                              style={{ width: '100%' }}
                              value={selectedPermissions}
                              onChange={(checkedValues) => form.setFieldValue('permissions', checkedValues)}
                            >
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                {group.permissions.map((permission) => (
                                  <Checkbox key={permission.code} value={permission.code}>
                                    {permission.label}
                                  </Checkbox>
                                ))}
                              </Space>
                            </Checkbox.Group>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              </Form.Item>
            </Space>
          )}

          {stepIndex === 2 && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="角色摘要">
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Typography.Text type="secondary">角色编码</Typography.Text>
                    <div>{summaryValues.code || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">角色名称</Typography.Text>
                    <div>{summaryValues.name || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">数据范围</Typography.Text>
                    <div>{dataScopeLabels[summaryValues.dataScope || ''] || summaryValues.dataScope || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">权限数量</Typography.Text>
                    <div>{selectedPermissionCount}</div>
                  </Col>
                </Row>
                {summaryScopeTargets.length > 0 && (
                  <>
                    <Divider />
                    <Typography.Text type="secondary">范围明细</Typography.Text>
                    <Space size={[8, 8]} wrap style={{ display: 'flex', marginTop: 8 }}>
                      {summaryScopeTargets.map((item) => (
                        <Tag key={item}>{item}</Tag>
                      ))}
                    </Space>
                  </>
                )}
                <Divider />
                <Typography.Text type="secondary">角色说明</Typography.Text>
                <div>{summaryValues.description || '未填写'}</div>
              </Card>

              <Card size="small" title="已选权限">
                <Space size={[8, 8]} wrap>
                  {(summaryValues.permissions ?? []).map((permissionCode: string) => (
                    <Tag key={permissionCode} color="blue">
                      {permissionCode}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Space>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

export default RoleList;
