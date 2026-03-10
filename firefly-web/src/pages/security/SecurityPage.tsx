import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Tabs, Tag, Popconfirm, Input, Select } from 'antd';
import { DeleteOutlined, ReloadOutlined, LogoutOutlined } from '@ant-design/icons';
import { loginLogApi, sessionApi, adminSessionApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface LoginLogItem {
  id: number;
  userId: number;
  username: string;
  loginType: string;
  platform: string;
  ip: string;
  userAgent: string;
  success: boolean;
  failReason: string;
  createdAt: string;
}

interface SessionItem {
  id: number;
  sessionId?: string; // 会话业务唯一标识
  platform: string;
  ip: string;
  userAgent: string;
  lastActiveAt: string;
  createdAt: string;
}

const LoginLogTab: React.FC = () => {
  const [data, setData] = useState<LoginLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>({ pageNum: 1, pageSize: 20 });
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await loginLogApi.list(params);
      const page = res.data.data;
      if (page.records) {
        setData(page.records);
        setTotal(page.total || 0);
      } else if (Array.isArray(page)) {
        setData(page);
        setTotal(page.length);
      }
    } catch { message.error('加载登录日志失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params]);

  const columns: ColumnsType<LoginLogItem> = [
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '登录方式', dataIndex: 'loginType', width: 100, render: (v: string) => <Tag>{v || 'PASSWORD'}</Tag> },
    { title: '平台', dataIndex: 'platform', width: 80, render: (v: string) => <Tag color="blue">{v || '-'}</Tag> },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '结果', dataIndex: 'success', width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? '成功' : '失败'}</Tag>,
    },
    { title: '失败原因', dataIndex: 'failReason', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    { title: 'User-Agent', dataIndex: 'userAgent', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createdAt', width: 170 },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索用户名/IP" allowClear style={{ width: 200 }}
          onSearch={(v: string) => setParams({ ...params, keyword: v || undefined, pageNum: 1 })} />
        <Select placeholder="登录结果" allowClear style={{ width: 120 }}
          onChange={(v: string) => setParams({ ...params, success: v, pageNum: 1 })}>
          <Select.Option value="true">成功</Select.Option>
          <Select.Option value="false">失败</Select.Option>
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1100 }}
        pagination={{ current: params.pageNum as number, pageSize: params.pageSize as number, total, showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (page: number, size: number) => setParams({ ...params, pageNum: page, pageSize: size }) }} />
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
      setData(res.data.data || []);
    } catch { message.error('加载会话失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleKick = async (id: number) => {
    await sessionApi.kick(id);
    message.success('已踢出');
    fetchData();
  };

  const columns: ColumnsType<SessionItem> = [
    { title: '会话标识', dataIndex: 'sessionId', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '平台', dataIndex: 'platform', width: 80, render: (v: string) => <Tag color="blue">{v || '-'}</Tag> },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    { title: 'User-Agent', dataIndex: 'userAgent', width: 260, ellipsis: true },
    { title: '最后活跃', dataIndex: 'lastActiveAt', width: 170 },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 100,
      render: (_: unknown, record: SessionItem) => (
        <Popconfirm title="踢出此会话？" onConfirm={() => handleKick(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>踢出</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Button icon={<ReloadOutlined />} onClick={fetchData} style={{ marginBottom: 16 }}>刷新</Button>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 900 }} pagination={false} />
    </div>
  );
};

const AdminSessionTab: React.FC = () => {
  const [userId, setUserId] = useState<number | null>(null);
  const [data, setData] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await adminSessionApi.getUserSessions(userId);
      setData(res.data.data || []);
    } catch { message.error('加载用户会话失败'); } finally { setLoading(false); }
  };

  const handleKickUser = async () => {
    if (!userId) return;
    await adminSessionApi.kickUser(userId);
    message.success('已强制下线');
    fetchData();
  };

  const columns: ColumnsType<SessionItem> = [
    { title: '会话标识', dataIndex: 'sessionId', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '平台', dataIndex: 'platform', width: 80, render: (v: string) => <Tag color="blue">{v || '-'}</Tag> },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    { title: 'User-Agent', dataIndex: 'userAgent', width: 260, ellipsis: true },
    { title: '最后活跃', dataIndex: 'lastActiveAt', width: 170 },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="用户名" style={{ width: 140 }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserId(e.target.value ? Number(e.target.value) : null)} />
        <Button type="primary" onClick={fetchData} disabled={!userId}>查询会话</Button>
        <Popconfirm title="强制下线该用户所有会话？" onConfirm={handleKickUser} disabled={!userId}>
          <Button danger icon={<LogoutOutlined />} disabled={!userId}>强制全部下线</Button>
        </Popconfirm>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 900 }} pagination={false} />
    </div>
  );
};

const SecurityPage: React.FC = () => {
  return (
    <div>
      <PageHeader title="安全管理" />
      <Tabs defaultActiveKey="login-log" items={[
        { key: 'login-log', label: '登录日志', children: <LoginLogTab /> },
        { key: 'my-session', label: '我的会话', children: <MySessionTab /> },
        { key: 'admin-session', label: '管理员会话', children: <AdminSessionTab /> },
      ]} />
    </div>
  );
};

export default SecurityPage;
