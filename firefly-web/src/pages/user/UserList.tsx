import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
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
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { roleApi, userApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

interface UserRoleSummary {
  roleId: number;
  roleCode: string;
  roleName: string;
}

interface UserRecord {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  email?: string;
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED' | string;
  avatarUrl?: string;
  createdAt?: string;
  lastLoginAt?: string;
  roles?: UserRoleSummary[];
}

interface RoleOption {
  id: number;
  code: string;
  name: string;
  systemFlag: boolean;
  status: string;
}

interface QueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

interface UserFormValues {
  username?: string;
  realName?: string;
  phone?: string;
  email?: string;
  password?: string;
  roles?: number[];
}

const statusLabels: Record<string, string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
  LOCKED: '锁定',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'success',
  DISABLED: 'error',
  LOCKED: 'warning',
};

const avatarColors = ['#2563eb', '#0f766e', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const UserList: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [queryForm] = Form.useForm();
  const [form] = Form.useForm<UserFormValues>();

  const [data, setData] = useState<UserRecord[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [params, setParams] = useState<QueryState>({ pageNum: 1, pageSize: 20 });

  const fetchData = async (nextParams = params) => {
    setLoading(true);
    try {
      const res = await userApi.list(nextParams as unknown as Record<string, unknown>);
      const page = res.data?.data ?? {};
      setData(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载用户列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRoleOptions = async () => {
    try {
      const res = await roleApi.options();
      setRoleOptions((res.data?.data ?? []) as RoleOption[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载可分配角色失败'));
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize]);

  useEffect(() => {
    void fetchRoleOptions();
  }, []);

  const stats = useMemo(
    () => ({
      active: data.filter((item) => item.status === 'ACTIVE').length,
      disabled: data.filter((item) => item.status === 'DISABLED').length,
      locked: data.filter((item) => item.status === 'LOCKED').length,
    }),
    [data],
  );

  const selectedRoleIds = Form.useWatch('roles', form) ?? [];

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    const nextParams: QueryState = {
      ...params,
      pageNum: 1,
      keyword: values.keyword?.trim() || undefined,
      status: values.status || undefined,
    };
    setParams(nextParams);
    void fetchData(nextParams);
  };

  const handleReset = () => {
    queryForm.resetFields();
    const nextParams: QueryState = { pageNum: 1, pageSize: params.pageSize };
    setParams(nextParams);
    void fetchData(nextParams);
  };

  const openCreateDrawer = () => {
    setEditingUser(null);
    setStepIndex(0);
    form.resetFields();
    form.setFieldsValue({ roles: [] });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: UserRecord) => {
    setEditingUser(record);
    setStepIndex(0);
    form.setFieldsValue({
      username: record.username,
      realName: record.realName,
      phone: record.phone,
      email: record.email,
      roles: record.roles?.map((role) => role.roleId) ?? [],
    });
    setDrawerOpen(true);
  };

  const handleUpdateStatus = async (record: UserRecord, status: string) => {
    try {
      await userApi.updateStatus(record.id, status);
      message.success('用户状态已更新');
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '更新用户状态失败'));
    }
  };

  const handleDelete = async (record: UserRecord) => {
    try {
      await userApi.delete(record.id);
      message.success('用户已删除');
      void fetchData({ ...params, pageNum: 1 });
    } catch (error) {
      message.error(getErrorMessage(error, '删除用户失败'));
    }
  };

  const handleNextStep = async () => {
    if (stepIndex === 0) {
      const requiredFields = editingUser
        ? ['username']
        : ['username', 'password'];
      await form.validateFields([...requiredFields, 'realName', 'phone', 'email']);
      setStepIndex(1);
      return;
    }

    if (stepIndex === 1) {
      if (!Array.isArray(selectedRoleIds) || selectedRoleIds.length === 0) {
        message.error('请至少选择一个角色');
        return;
      }
      setStepIndex(2);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const rolesPayload = (values.roles ?? []).map((roleId) => ({ roleId }));
      setSaving(true);

      if (editingUser) {
        await userApi.update(editingUser.id, {
          realName: values.realName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
        });
        await userApi.assignRoles(editingUser.id, rolesPayload);
        message.success('用户已更新');
      } else {
        await userApi.create({
          username: values.username?.trim(),
          realName: values.realName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
          password: values.password?.trim() || undefined,
          roles: rolesPayload,
        });
        message.success('用户已创建');
      }

      setDrawerOpen(false);
      form.resetFields();
      void fetchData({ ...params, pageNum: 1 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '保存用户失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<UserRecord> = [
    {
      title: '用户',
      dataIndex: 'username',
      width: 240,
      render: (_value: string, record) => (
        <Space size={12}>
          <Avatar
            src={record.avatarUrl}
            icon={<UserOutlined />}
            style={{ background: avatarColors[record.id % avatarColors.length] }}
          />
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>
              {record.realName || record.username}
            </div>
            <div style={{ color: '#64748b', fontSize: 12 }}>@{record.username}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 260,
      render: (roles?: UserRoleSummary[]) => (
        roles && roles.length > 0 ? (
          <Space size={[6, 6]} wrap>
            {roles.map((role) => (
              <Tag key={`${role.roleId}-${role.roleCode}`} color="blue">
                {role.roleName}
              </Tag>
            ))}
          </Space>
        ) : '-'
      ),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      width: 160,
      render: (value?: string) => value || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 220,
      render: (value?: string) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={statusColors[value] || 'default'}>{statusLabels[value] || value}</Tag>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      width: 180,
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
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEditDrawer(record)}>
            编辑
          </Button>
          {record.status === 'ACTIVE' ? (
            <Button type="link" size="small" danger onClick={() => void handleUpdateStatus(record, 'DISABLED')}>
              停用
            </Button>
          ) : (
            <Button type="link" size="small" onClick={() => void handleUpdateStatus(record, 'ACTIVE')}>
              启用
            </Button>
          )}
          <Button type="link" size="small" danger onClick={() => void handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const stepItems = [
    { title: '账号信息' },
    { title: '角色分配' },
    { title: '确认提交' },
  ];

  const summaryValues = form.getFieldsValue();
  const selectedRoles = roleOptions.filter((role) => (summaryValues.roles ?? []).includes(role.id));

  return (
    <div>
      <PageHeader
        title="用户管理"
        description={
          currentUser?.userType === 'SYSTEM_OPS'
            ? '系统运维空间下创建的用户只能分配系统运维角色。'
            : '租户空间下创建的用户只能分配当前租户可用角色。'
        }
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            新建用户
          </Button>
        )}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="用户创建说明"
        description={
          currentUser?.userType === 'SYSTEM_OPS'
            ? '系统运维用户会自动归属系统运维空间，不能分配租户业务空间角色。'
            : '租户用户会自动归属当前租户，角色选择范围只来自当前租户已启用角色。'
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="用户总数" value={total} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="启用用户" value={stats.active} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="受限用户" value={stats.disabled + stats.locked} prefix={<LockOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="用户名 / 姓名 / 手机号" style={{ width: 260 }} />
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
        <Table<UserRecord>
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1360 }}
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
        title={editingUser ? `编辑用户 - ${editingUser.username}` : '新建用户'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={920}
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
                  保存用户
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
                  name="username"
                  label="用户名"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 2, message: '用户名长度至少 2 位' },
                    { max: 64, message: '用户名长度不能超过 64 位' },
                  ]}
                >
                  <Input placeholder="用于登录的唯一账号名" disabled={!!editingUser} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="realName" label="姓名">
                  <Input placeholder="可选，用于页面展示" />
                </Form.Item>
              </Col>
              {!editingUser && (
                <Col span={12}>
                  <Form.Item
                    name="password"
                    label="初始密码"
                    rules={[{ required: true, message: '请输入初始密码' }]}
                  >
                    <Input.Password placeholder="请输入初始密码" />
                  </Form.Item>
                </Col>
              )}
              <Col span={12}>
                <Form.Item name="phone" label="手机号">
                  <Input placeholder="可选" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}
                >
                  <Input placeholder="可选" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {stepIndex === 1 && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="角色分配"
                description="角色列表采用步骤式配置，不再把很长的下拉直接塞进一个弹窗。只展示当前空间可分配角色。"
              />

              <Card
                size="small"
                title="可分配角色"
                extra={(
                  <Typography.Text type="secondary">
                    已选 {selectedRoleIds.length} 项
                  </Typography.Text>
                )}
              >
                <Form.Item name="roles" noStyle>
                  <CheckboxRoleBoard
                    roles={roleOptions}
                    selectedRoleIds={selectedRoleIds}
                    onChange={(nextRoleIds) => form.setFieldValue('roles', nextRoleIds)}
                  />
                </Form.Item>
              </Card>
            </Space>
          )}

          {stepIndex === 2 && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="用户摘要">
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Typography.Text type="secondary">用户名</Typography.Text>
                    <div>{summaryValues.username || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">姓名</Typography.Text>
                    <div>{summaryValues.realName || '未填写'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">手机号</Typography.Text>
                    <div>{summaryValues.phone || '未填写'}</div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text type="secondary">邮箱</Typography.Text>
                    <div>{summaryValues.email || '未填写'}</div>
                  </Col>
                </Row>
              </Card>

              <Card size="small" title="已选角色">
                <Space size={[8, 8]} wrap>
                  {selectedRoles.map((role) => (
                    <Tag key={role.id} color="blue">
                      {role.name}
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

interface CheckboxRoleBoardProps {
  roles: RoleOption[];
  selectedRoleIds: number[];
  onChange: (roleIds: number[]) => void;
}

const CheckboxRoleBoard: React.FC<CheckboxRoleBoardProps> = ({ roles, selectedRoleIds, onChange }) => {
  const selectedSet = new Set(selectedRoleIds);

  return (
    <Row gutter={[16, 16]}>
      {roles.map((role) => {
        const checked = selectedSet.has(role.id);
        return (
          <Col span={12} key={role.id}>
            <Card
              size="small"
              hoverable
              style={{
                borderColor: checked ? '#4f46e5' : undefined,
                boxShadow: checked ? '0 0 0 1px rgba(79, 70, 229, 0.16)' : undefined,
              }}
              onClick={() => {
                const nextSelected = new Set(selectedRoleIds);
                if (checked) {
                  nextSelected.delete(role.id);
                } else {
                  nextSelected.add(role.id);
                }
                onChange([...nextSelected]);
              }}
            >
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                  <Space wrap>
                    <Typography.Text strong>{role.name}</Typography.Text>
                    <Tag color={role.systemFlag ? 'gold' : 'blue'}>
                      {role.systemFlag ? '系统角色' : '业务角色'}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    {role.code}
                  </Typography.Text>
                </div>
                <Tag color={checked ? 'success' : 'default'}>
                  {checked ? '已选择' : '未选择'}
                </Tag>
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default UserList;
