import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { userApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

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
}

interface QueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

const statusLabels: Record<string, string> = {
  ACTIVE: '正常',
  DISABLED: '禁用',
  LOCKED: '锁定',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'success',
  DISABLED: 'error',
  LOCKED: 'warning',
};

const avatarColors = ['#2563eb', '#0f766e', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const UserList: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [queryForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [data, setData] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [params, setParams] = useState<QueryState>({ pageNum: 1, pageSize: 20 });

  const fetchData = async (nextParams = params) => {
    setLoading(true);
    try {
      const res = await userApi.list(nextParams as unknown as Record<string, unknown>);
      const page = res.data?.data ?? {};
      setData(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize]);

  const stats = useMemo(
    () => ({
      active: data.filter((item) => item.status === 'ACTIVE').length,
      disabled: data.filter((item) => item.status === 'DISABLED').length,
      locked: data.filter((item) => item.status === 'LOCKED').length,
    }),
    [data],
  );

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

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await userApi.create({
        ...values,
        password: values.password?.trim() || undefined,
      });
      message.success('用户创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      void fetchData({ ...params, pageNum: 1 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error('用户创建失败');
    }
  };

  const columns: ColumnsType<UserRecord> = [
    {
      title: '用户',
      dataIndex: 'username',
      width: 220,
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
      title: '手机号',
      dataIndex: 'phone',
      width: 150,
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
  ];

  const statCards = [
    {
      title: '用户总数',
      value: total,
      icon: <TeamOutlined />,
      color: '#2563eb',
      background: 'rgba(37, 99, 235, 0.10)',
    },
    {
      title: '正常',
      value: stats.active,
      icon: <CheckCircleOutlined />,
      color: '#059669',
      background: 'rgba(5, 150, 105, 0.10)',
    },
    {
      title: '禁用',
      value: stats.disabled,
      icon: <StopOutlined />,
      color: '#dc2626',
      background: 'rgba(220, 38, 38, 0.10)',
    },
    {
      title: '锁定',
      value: stats.locked,
      icon: <LockOutlined />,
      color: '#d97706',
      background: 'rgba(217, 119, 6, 0.10)',
    },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        description={
          currentUser?.userType === 'SYSTEM_OPS'
            ? '维护平台或当前运维租户下的用户账号。'
            : '维护当前租户下的成员账号，创建后默认归属当前租户。'
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        }
      />

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="用户创建说明"
        description="租户业务空间内创建的用户会自动绑定到当前租户，无需手工填写租户信息。若未填写初始密码，系统将自动生成一组临时密码。"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {statCards.map((item) => (
          <Col xs={12} md={6} key={item.title}>
            <Card
              style={{ borderRadius: 14, border: 'none', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' }}
              styles={{ body: { padding: 16 } }}
            >
              <Space size={12}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: item.color,
                    background: item.background,
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{item.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        style={{ marginBottom: 16, borderRadius: 14, border: 'none', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' }}
      >
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear prefix={<SearchOutlined />} placeholder="用户名 / 姓名 / 手机号" style={{ width: 260 }} />
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
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' }}>
        <Table<UserRecord>
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
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

      <Modal
        destroyOnClose
        title="新建用户"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => void handleCreate()}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, message: '用户名至少 2 位' },
            ]}
          >
            <Input placeholder="用于登录的唯一账号名" />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input placeholder="可选，作为页面展示名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}
          >
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="password" label="初始密码">
            <Input.Password placeholder="可选，不填则由系统自动生成" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserList;
