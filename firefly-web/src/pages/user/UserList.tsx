import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
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
  ReloadOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { roleApi, userApi } from '../../services/api';
import { generateRandomPassword } from '../../utils/password';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

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

interface StatusTarget {
  record: UserRecord;
  nextStatus: 'ACTIVE' | 'DISABLED';
}

interface PasswordResult {
  username: string;
  password: string;
}

const toUserFormValues = (record?: UserRecord | null): UserFormValues => ({
  username: record?.username,
  realName: record?.realName,
  phone: record?.phone,
  email: record?.email,
  roles: record?.roles?.map((role) => role.roleId) ?? [],
});

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

const EMPTY_ROLE_IDS: number[] = [];

const UserList: React.FC = () => {
  const [queryForm] = Form.useForm();
  const [form] = Form.useForm<UserFormValues>();

  const [data, setData] = useState<UserRecord[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailDirty, setDetailDirty] = useState(false);
  const [total, setTotal] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [params, setParams] = useState<QueryState>({ pageNum: 1, pageSize: 20 });
  const [reloadToken, setReloadToken] = useState(0);

  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [passwordResult, setPasswordResult] = useState<PasswordResult | null>(null);

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(drawerOpen && detailDirty);
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

  const listRequestIdRef = useRef(0);

  const fetchData = async (nextParams: QueryState) => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await userApi.list(nextParams as unknown as Record<string, unknown>);
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const page = res.data?.data ?? {};
      setData(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载用户列表失败'));
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
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
    void fetchData(params);
  }, [params, reloadToken]);

  useEffect(() => {
    void fetchRoleOptions();
  }, []);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    // Drawer uses destroyOnClose, so populate after mount to keep edit values stable.
    if (editingUser) {
      form.setFieldsValue(toUserFormValues(editingUser));
      return;
    }
    form.resetFields();
    form.setFieldsValue({ roles: [] });
  }, [drawerOpen, editingUser, form]);

  const stats = useMemo(
    () => ({
      active: data.filter((item) => item.status === 'ACTIVE').length,
      disabled: data.filter((item) => item.status === 'DISABLED').length,
      locked: data.filter((item) => item.status === 'LOCKED').length,
    }),
    [data],
  );

  const selectedRoleIds = Form.useWatch('roles', form) ?? EMPTY_ROLE_IDS;

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    setParams((previous) => ({
      ...previous,
      pageNum: 1,
      keyword: values.keyword?.trim() || undefined,
      status: values.status || undefined,
    }));
  };

  const handleReset = () => {
    queryForm.resetFields();
    setParams((previous) => ({ pageNum: 1, pageSize: previous.pageSize }));
  };

  const reloadList = (resetPage = false) => {
    setParams((previous) => (resetPage && previous.pageNum !== 1 ? { ...previous, pageNum: 1 } : previous));
    setReloadToken((current) => current + 1);
  };

  const openCreateDrawer = () => {
    setEditingUser(null);
    setStepIndex(0);
    setDetailDirty(false);
    setDrawerOpen(true);
  };

  const openEditDrawer = async (record: UserRecord) => {
    setEditingUser(null);
    setStepIndex(0);
    setDetailDirty(false);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const res = await userApi.get(record.id);
      setEditingUser((res.data?.data ?? record) as UserRecord);
    } catch (error) {
      setEditingUser(record);
      message.error(getErrorMessage(error, '加载用户详情失败，已使用列表数据回填'));
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    confirmDiscard(detailDirty, () => {
      setDrawerOpen(false);
      setDetailDirty(false);
    });
  };

  const handleConfirmStatus = async () => {
    if (!statusTarget) {
      return;
    }
    setStatusSubmitting(true);
    try {
      await userApi.updateStatus(statusTarget.record.id, statusTarget.nextStatus);
      message.success(statusTarget.nextStatus === 'ACTIVE' ? '用户已启用' : '用户已停用');
      setStatusTarget(null);
      reloadList();
    } catch (error) {
      // 失败时保留确认弹窗，避免用户误以为操作已完成。
      message.error(getErrorMessage(error, '更新用户状态失败'));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      await userApi.delete(deleteTarget.id);
      message.success('用户已删除');
      setDeleteTarget(null);
      reloadList(true);
    } catch (error) {
      message.error(getErrorMessage(error, '删除用户失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetTarget) {
      return;
    }
    const newPassword = generateRandomPassword();
    setResetSubmitting(true);
    try {
      await userApi.resetPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setPasswordResult({ username: resetTarget.username, password: newPassword });
    } catch (error) {
      message.error(getErrorMessage(error, '重置密码失败'));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleNextStep = async () => {
    try {
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
    } catch (error) {
      // 字段校验错误已由表单展示，这里只兜底非校验异常，避免未处理的 Promise。
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '校验步骤信息失败'));
    }
  };

  const handleSave = async () => {
    let baseInfoSaved = false;
    try {
      // 步骤面板保持挂载，这里能一次性校验并取回三个步骤的全部字段。
      const values = await form.validateFields();
      const rolesPayload = (values.roles ?? []).map((roleId) => ({ roleId }));
      setSaving(true);

      if (editingUser) {
        await userApi.update(editingUser.id, {
          realName: values.realName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
        });
        baseInfoSaved = true;
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

      setDetailDirty(false);
      setDrawerOpen(false);
      form.resetFields();
      reloadList(true);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        const fields = (error as { errorFields?: Array<{ name?: Array<string | number> }> }).errorFields ?? [];
        const firstName = fields[0]?.name?.[0];
        setStepIndex(firstName === 'roles' ? 1 : 0);
        message.error('请先补全必填项后再保存');
        return;
      }
      if (baseInfoSaved) {
        // 基本资料与角色分配是两个请求；后一个失败时不能笼统提示“保存失败”。
        message.error(`用户资料已保存，但角色分配失败：${getErrorMessage(error, '请重试角色分配')}`);
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
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      width: 320,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => setResetTarget(record)}>
            重置密码
          </Button>
          {record.status === 'ACTIVE' ? (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => setStatusTarget({ record, nextStatus: 'DISABLED' })}
            >
              停用
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              onClick={() => setStatusTarget({ record, nextStatus: 'ACTIVE' })}
            >
              启用
            </Button>
          )}
          <Button type="link" size="small" danger onClick={() => setDeleteTarget(record)}>
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
  const hasQueryFilters = Boolean(params.keyword || params.status);
  const stepPanelStyle = (step: number): React.CSSProperties => ({
    display: stepIndex === step ? 'block' : 'none',
  });

  return (
    <div>
      <PageHeader
        title="用户管理"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => reloadList()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              新建用户
            </Button>
          </Space>
        )}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="用户总数" value={total} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="启用用户（当前页）" value={stats.active} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="受限用户（当前页）" value={stats.disabled + stats.locked} prefix={<LockOutlined />} />
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
          scroll={{ x: 1400 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasQueryFilters}
                emptyText="暂无用户，请先新建用户"
                filteredText="没有符合当前筛选条件的用户"
                onClearFilters={handleReset}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (pageNum, pageSize) => {
              setParams((previous) => ({ ...previous, pageNum, pageSize }));
            },
          }}
        />
      </Card>

      <Drawer
        destroyOnClose
        title={editingUser ? `编辑用户 - ${editingUser.username}` : '新建用户'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={920}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={closeDrawer}>取消</Button>
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

        <Spin spinning={drawerLoading}>
          <Form
            form={form}
            layout="vertical"
            onValuesChange={() => setDetailDirty(true)}
          >
            {/* 步骤面板保持挂载（display 隐藏），否则最终保存只能拿到当前步骤字段，
                会丢掉账号信息或角色分配。 */}
            <div style={stepPanelStyle(0)}>
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
            </div>

            <div style={stepPanelStyle(1)}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card
                  size="small"
                  title="可分配角色"
                  extra={(
                    <Typography.Text type="secondary">
                      已选 {selectedRoleIds.length} 项
                    </Typography.Text>
                  )}
                >
                  {roleOptions.length === 0 ? (
                    <ListEmpty emptyText="暂无可分配角色，请先在角色管理中创建角色" />
                  ) : (
                    <Form.Item name="roles" noStyle>
                      <CheckboxRoleBoard
                        roles={roleOptions}
                        selectedRoleIds={selectedRoleIds}
                        onChange={(nextRoleIds) => form.setFieldValue('roles', nextRoleIds)}
                      />
                    </Form.Item>
                  )}
                </Card>
              </Space>
            </div>

            <div style={stepPanelStyle(2)}>
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
                  {selectedRoles.length > 0 ? (
                    <Space size={[8, 8]} wrap>
                      {selectedRoles.map((role) => (
                        <Tag key={role.id} color="blue">
                          {role.name}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">尚未选择角色</Typography.Text>
                  )}
                </Card>
              </Space>
            </div>
          </Form>
        </Spin>
      </Drawer>

      <Modal
        open={Boolean(statusTarget)}
        title={statusTarget?.nextStatus === 'ACTIVE' ? '启用用户' : '停用用户'}
        okText={statusTarget?.nextStatus === 'ACTIVE' ? '确认启用' : '确认停用'}
        cancelText="取消"
        okButtonProps={{ danger: statusTarget?.nextStatus === 'DISABLED' }}
        confirmLoading={statusSubmitting}
        maskClosable={!statusSubmitting}
        onCancel={() => {
          if (!statusSubmitting) {
            setStatusTarget(null);
          }
        }}
        onOk={() => void handleConfirmStatus()}
        destroyOnClose
      >
        {statusTarget ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              用户：<Typography.Text strong>{statusTarget.record.realName || statusTarget.record.username}</Typography.Text>
              （{statusTarget.record.username}）
            </Typography.Text>
            {statusTarget.nextStatus === 'DISABLED' ? (
              <>
                <Typography.Text>停用后该账号将无法登录。</Typography.Text>
                <Typography.Text type="secondary">
                  账号数据和角色关联会保留，需要恢复时可在列表中重新启用；如只是临时限制登录，请优先使用停用而不是删除。
                </Typography.Text>
              </>
            ) : (
              <Typography.Text>启用后该账号可重新登录，原有角色和权限保持不变。</Typography.Text>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="删除用户"
        okText="删除用户"
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
              确认删除用户 <Typography.Text strong>{deleteTarget.username}</Typography.Text>？
            </Typography.Text>
            <Typography.Text>
              删除后该账号将无法登录，账号与角色的关联会被清除，且不可恢复；历史业务和审计记录保留。
            </Typography.Text>
            <Typography.Text type="secondary">
              如果只是需要禁止登录，请优先使用“停用”，停用后可随时恢复。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title="重置用户密码"
        okText="重置密码"
        cancelText="取消"
        confirmLoading={resetSubmitting}
        maskClosable={!resetSubmitting}
        onCancel={() => {
          if (!resetSubmitting) {
            setResetTarget(null);
          }
        }}
        onOk={() => void handleConfirmResetPassword()}
        destroyOnClose
      >
        {resetTarget ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              将为用户 <Typography.Text strong>{resetTarget.username}</Typography.Text> 生成新的随机密码。
            </Typography.Text>
            <Typography.Text>重置后旧密码立即失效，用户需要使用新密码重新登录。</Typography.Text>
            <Typography.Text type="secondary">新密码只在重置成功后展示一次，请先准备好转交给用户。</Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(passwordResult)}
        title="密码已重置"
        okText="我已保存，关闭"
        maskClosable={false}
        keyboard={false}
        closable={false}
        onOk={() => setPasswordResult(null)}
        onCancel={() => setPasswordResult(null)}
        destroyOnClose
      >
        {passwordResult ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>
              用户 <Typography.Text strong>{passwordResult.username}</Typography.Text> 的新密码如下，请及时通知用户登录后修改。
            </Typography.Text>
            <Typography.Paragraph
              copyable={{ text: passwordResult.password, tooltips: ['复制密码', '已复制'] }}
              style={{
                marginBottom: 0,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: 16,
              }}
            >
              {passwordResult.password}
            </Typography.Paragraph>
            <Typography.Text type="secondary">
              关闭弹窗后无法再次查看该密码，请先复制或妥善记录。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>
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
