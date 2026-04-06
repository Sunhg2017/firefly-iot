import React, { useEffect, useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { DeleteOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { adminSessionApi, authApi, loginLogApi, sessionApi } from '../../services/api';

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
  platform?: string | null;
  loginMethod?: string | null;
  loginIp?: string | null;
  userAgent?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string | null;
}

interface AdminSessionItem extends SessionItem {
  username?: string | null;
  realName?: string | null;
  tenantName?: string | null;
  adminType?: string | null;
}

interface LoginLogQueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  result?: string;
}

interface AdminSessionQueryState {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  platform?: string;
  adminType?: string;
}

interface OauthBindingItem {
  id: number;
  provider?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
}

interface OauthProviderItem {
  provider: string;
  displayName: string;
  enabled: boolean;
  webAuthorizeSupported: boolean;
  webBindSupported: boolean;
  apiLoginSupported: boolean;
  usageHint?: string | null;
}

const renderPlatform = (value?: string | null) => <Tag color="blue">{value || '-'}</Tag>;

const renderLoginMethod = (value?: string | null) => <Tag>{value || 'PASSWORD'}</Tag>;

const renderAdminType = (value?: string | null) => {
  if (value === 'SYSTEM_OPS') {
    return <Tag color="geekblue">系统运维</Tag>;
  }
  if (value === 'TENANT_SUPER_ADMIN') {
    return <Tag color="gold">租户管理员</Tag>;
  }
  return <Tag>{value || '-'}</Tag>;
};

const renderOauthBindingStatus = (bound: boolean) => (
  <Tag color={bound ? 'success' : 'default'}>{bound ? '已绑定' : '未绑定'}</Tag>
);

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
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '登录方式',
      dataIndex: 'loginMethod',
      width: 120,
      render: (value?: string | null) => renderLoginMethod(value),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => renderPlatform(value),
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
      width: 320,
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
        scroll={{ x: 1400 }}
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
      message.success('会话已下线');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '下线会话失败');
    }
  };

  const columns: ColumnsType<SessionItem> = [
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => renderPlatform(value),
    },
    {
      title: '登录方式',
      dataIndex: 'loginMethod',
      width: 120,
      render: (value?: string | null) => renderLoginMethod(value),
    },
    {
      title: 'IP',
      dataIndex: 'loginIp',
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 360,
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
      title: '登录时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_value, record) => (
        <Popconfirm title="确认下线这个会话吗？" onConfirm={() => void handleKick(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            下线
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
        scroll={{ x: 1280 }}
        pagination={false}
      />
    </div>
  );
};

const AdminSessionTab: React.FC = () => {
  const [data, setData] = useState<AdminSessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<AdminSessionQueryState>({ pageNum: 1, pageSize: 20 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await adminSessionApi.list({ ...query });
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
      message.error(error instanceof Error ? error.message : '加载管理员会话失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [query]);

  const handleKickSession = async (sessionId: number) => {
    try {
      await adminSessionApi.kickSession(sessionId);
      message.success('管理员会话已下线');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '下线管理员会话失败');
    }
  };

  const handleKickUser = async (username: string) => {
    try {
      await adminSessionApi.kickUser(username);
      message.success('管理员全部会话已下线');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '下线管理员全部会话失败');
    }
  };

  const columns: ColumnsType<AdminSessionItem> = [
    {
      title: '管理员',
      width: 180,
      render: (_value, record) => (
        <div>
          <div>{record.realName || record.username || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{record.username || '-'}</div>
        </div>
      ),
    },
    {
      title: '所属租户',
      dataIndex: 'tenantName',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '身份',
      dataIndex: 'adminType',
      width: 130,
      render: (value?: string | null) => renderAdminType(value),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (value?: string | null) => renderPlatform(value),
    },
    {
      title: '登录方式',
      dataIndex: 'loginMethod',
      width: 120,
      render: (value?: string | null) => renderLoginMethod(value),
    },
    {
      title: 'IP',
      dataIndex: 'loginIp',
      width: 160,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 360,
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
      title: '登录时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space size={4}>
          <Popconfirm title="确认下线这个管理员会话吗？" onConfirm={() => void handleKickSession(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              下线会话
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`确认下线 ${record.username || '该管理员'} 的全部会话吗？`}
            onConfirm={() => record.username && void handleKickUser(record.username)}
            disabled={!record.username}
          >
            <Button type="link" size="small" danger icon={<LogoutOutlined />} disabled={!record.username}>
              全部下线
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          allowClear
          enterButton="查询"
          placeholder="搜索管理员账号、姓名、租户或登录 IP"
          style={{ width: 320 }}
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
          placeholder="平台"
          style={{ width: 140 }}
          value={query.platform}
          onChange={(value) =>
            setQuery((current) => ({
              ...current,
              platform: value || undefined,
              pageNum: 1,
            }))
          }
          options={[
            { label: 'WEB', value: 'WEB' },
            { label: 'APP_IOS', value: 'APP_IOS' },
            { label: 'APP_ANDROID', value: 'APP_ANDROID' },
            { label: 'MINI_WECHAT', value: 'MINI_WECHAT' },
            { label: 'MINI_ALIPAY', value: 'MINI_ALIPAY' },
          ]}
        />
        <Select
          allowClear
          placeholder="身份"
          style={{ width: 160 }}
          value={query.adminType}
          onChange={(value) =>
            setQuery((current) => ({
              ...current,
              adminType: value || undefined,
              pageNum: 1,
            }))
          }
          options={[
            { label: '系统运维', value: 'SYSTEM_OPS' },
            { label: '租户管理员', value: 'TENANT_SUPER_ADMIN' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
          刷新
        </Button>
      </Space>

      <Table<AdminSessionItem>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1680 }}
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

const OauthBindingTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [bindingProvider, setBindingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<OauthProviderItem[]>([]);
  const [bindings, setBindings] = useState<OauthBindingItem[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [providerRes, bindingRes] = await Promise.all([
        authApi.listOauthProviders(),
        sessionApi.listOauthBindings(),
      ]);
      setProviders(Array.isArray(providerRes.data?.data) ? providerRes.data.data : []);
      setBindings(Array.isArray(bindingRes.data?.data) ? bindingRes.data.data : []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载第三方绑定失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const startBinding = async (provider: string) => {
    setBindingProvider(provider);
    try {
      const redirectUri = `${window.location.origin}/oauth/bind/callback?provider=${encodeURIComponent(provider)}`;
      const res = await sessionApi.buildOauthAuthorizeUrl({
        provider,
        action: 'BIND',
        redirectUri,
      });
      const authorizeUrl = res.data?.data?.authorizeUrl;
      if (typeof authorizeUrl !== 'string' || !authorizeUrl) {
        throw new Error('未获取到绑定授权地址');
      }
      window.location.href = authorizeUrl;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '拉起绑定失败');
      setBindingProvider(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await sessionApi.deleteOauthBinding(id);
      message.success('第三方账号已解绑');
      await fetchData();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '解绑失败');
    }
  };

  const bindingMap = new Map(bindings.map((binding) => [binding.provider || '', binding]));

  const dataSource = providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      ...provider,
      binding: bindingMap.get(provider.provider),
    }));

  const columns: ColumnsType<OauthProviderItem & { binding?: OauthBindingItem }> = [
    {
      title: '提供商',
      dataIndex: 'displayName',
      width: 160,
      render: (_value, record) => (
        <div>
          <div>{record.displayName}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{record.provider}</div>
        </div>
      ),
    },
    {
      title: '绑定状态',
      width: 120,
      render: (_value, record) => renderOauthBindingStatus(Boolean(record.binding)),
    },
    {
      title: '绑定账号',
      width: 220,
      render: (_value, record) => record.binding?.nickname || '-',
    },
    {
      title: '可用方式',
      width: 260,
      render: (_value, record) => record.usageHint || '-',
    },
    {
      title: '绑定时间',
      width: 180,
      render: (_value, record) => record.binding?.createdAt || '-',
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_value, record) => {
        if (record.binding?.id) {
          return (
            <Popconfirm title="确认解绑这个第三方账号吗？" onConfirm={() => void handleDelete(record.binding!.id)}>
              <Button type="link" danger size="small">
                解绑
              </Button>
            </Popconfirm>
          );
        }

        if (record.webBindSupported) {
          return (
            <Button
              type="link"
              size="small"
              loading={bindingProvider === record.provider}
              onClick={() => void startBinding(record.provider)}
            >
              去绑定
            </Button>
          );
        }

        return <span style={{ color: '#8c8c8c' }}>客户端绑定</span>;
      },
    },
  ];

  return (
    <div>
      <Button icon={<ReloadOutlined />} onClick={() => void fetchData()} style={{ marginBottom: 16 }}>
        刷新
      </Button>
      <Table
        rowKey="provider"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        size="small"
        scroll={{ x: 1120 }}
        pagination={false}
      />
    </div>
  );
};

const SecurityPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get('tab') || 'login-log';

  return (
    <div>
      <PageHeader title="安全管理" />
      <Tabs
        activeKey={activeKey}
        onChange={(key) => setSearchParams({ tab: key })}
        items={[
          { key: 'login-log', label: '登录日志', children: <LoginLogTab /> },
          { key: 'my-session', label: '我的会话', children: <MySessionTab /> },
          { key: 'admin-session', label: '管理员会话', children: <AdminSessionTab /> },
          { key: 'oauth-binding', label: '第三方绑定', children: <OauthBindingTab /> },
        ]}
      />
    </div>
  );
};

export default SecurityPage;
