import React, { useEffect, useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { DeleteOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { adminSessionApi, loginLogApi, sessionApi } from '../../services/api';

interface LoginLogItem {
  id: number;
  userId?: number | null;
  username?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
  loginIp?: string | null;
  userAgent?: string | null;
  result?: string | null;
  failReason?: string | null;
  createdAt?: string | null;
}

interface SessionItem {
  id: number;
  sessionId?: string | null;
  platform?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string | null;
}

interface LoginLogQueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  result?: string;
}

const LoginLogTab: React.FC = () => {
  const [data, setData] = useState<LoginLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<LoginLogQueryState>({ pageNum: 1, pageSize: 20 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await loginLogApi.list({ ...query });
      const page = res.data?.data;
      if (Array.isArray(page?.records)) {
        setData(page.records);
        setTotal(page.total || 0);
      } else if (Array.isArray(page)) {
        setData(page);
        setTotal(page.length);
      } else {
        setData([]);
        setTotal(0);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载登录日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [query]);

  const columns: ColumnsType<LoginLogItem> = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '登录方式',
      dataIndex: 'loginMethod',
      width: 120,
      render: (value?: string | null) => <Tag>{value || 'PASSWORD'}</Tag>,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'loginIp',
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 100,
      render: (value?: string | null) => {
        const success = value === 'SUCCESS';
        return <Tag color={success ? 'success' : 'error'}>{success ? '成功' : '失败'}</Tag>;
      },
    },
    {
      title: '失败原因',
      dataIndex: 'failReason',
      width: 180,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 260,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          allowClear
          enterButton="查询"
          placeholder="搜索用户名或登录 IP"
          style={{ width: 260 }}
          onSearch={(value) =>
            setQuery((current) => ({
              ...current,
              keyword: value?.trim() || undefined,
              pageNum: 1,
            }))
          }
        />
        <Select
          allowClear
          placeholder="登录结果"
          style={{ width: 140 }}
          value={query.result}
          onChange={(value) =>
            setQuery((current) => ({
              ...current,
              result: value || undefined,
              pageNum: 1,
            }))
          }
          options={[
            { label: '成功', value: 'SUCCESS' },
            { label: '失败', value: 'FAILED' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
          刷新
        </Button>
      </Space>

      <Table<LoginLogItem>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1280 }}
        pagination={{
          current: query.pageNum,
          pageSize: query.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (page, pageSize) =>
            setQuery((current) => ({
              ...current,
              pageNum: page,
              pageSize,
            })),
        }}
      />
    </div>
  );
};

const MySessionTab: React.FC = () => {
  const [data, setData] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await sessionApi.list();
      setData(res.data?.data || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载会话失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleKick = async (id: number) => {
    try {
      await sessionApi.kick(id);
      message.success('已踢出');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '踢出会话失败');
    }
  };

  const columns: ColumnsType<SessionItem> = [
    {
      title: '会话标识',
      dataIndex: 'sessionId',
      width: 220,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 280,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '最后活跃时间',
      dataIndex: 'lastActiveAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '操作',
      width: 110,
      render: (_value, record) => (
        <Popconfirm title="确认踢出这个会话吗？" onConfirm={() => void handleKick(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            踢出
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Button icon={<ReloadOutlined />} onClick={() => void fetchData()} style={{ marginBottom: 16 }}>
        刷新
      </Button>
      <Table<SessionItem>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        pagination={false}
      />
    </div>
  );
};

const AdminSessionTab: React.FC = () => {
  const [userId, setUserId] = useState<number | null>(null);
  const [data, setData] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!userId) {
      return;
    }
    setLoading(true);
    try {
      const res = await adminSessionApi.getUserSessions(userId);
      setData(res.data?.data || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载用户会话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleKickUser = async () => {
    if (!userId) {
      return;
    }
    try {
      await adminSessionApi.kickUser(userId);
      message.success('已强制全部下线');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '强制下线失败');
    }
  };

  const columns: ColumnsType<SessionItem> = [
    {
      title: '会话标识',
      dataIndex: 'sessionId',
      width: 220,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 280,
      ellipsis: true,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '最后活跃时间',
      dataIndex: 'lastActiveAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="输入用户 ID"
          style={{ width: 160 }}
          onChange={(event) => {
            const value = event.target.value.trim();
            setUserId(value ? Number(value) : null);
          }}
        />
        <Button type="primary" onClick={() => void fetchData()} disabled={!userId}>
          查询会话
        </Button>
        <Popconfirm title="确认强制下线该用户的所有会话吗？" onConfirm={() => void handleKickUser()} disabled={!userId}>
          <Button danger icon={<LogoutOutlined />} disabled={!userId}>
            强制全部下线
          </Button>
        </Popconfirm>
      </Space>

      <Table<SessionItem>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        pagination={false}
      />
    </div>
  );
};

const SecurityPage: React.FC = () => {
  return (
    <div>
      <PageHeader title="安全管理" />
      <Tabs
        defaultActiveKey="login-log"
        items={[
          { key: 'login-log', label: '登录日志', children: <LoginLogTab /> },
          { key: 'my-session', label: '我的会话', children: <MySessionTab /> },
          { key: 'admin-session', label: '管理员会话', children: <AdminSessionTab /> },
        ]}
      />
    </div>
  );
};

export default SecurityPage;
