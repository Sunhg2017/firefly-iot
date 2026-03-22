import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Checkbox, Form, Input, Space, Tabs, Tag, Typography, message } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  CloudServerOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../store/useAuthStore';
import { getUserHomePath } from '../../config/workspaceRoutes';

const { Text, Title } = Typography;

const loginInputStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 12,
  background: '#ffffff',
};

const featureCards = [
  {
    title: '选择登录方式',
    description: '支持账号密码和手机号两种登录方式。',
    icon: <CloudServerOutlined />,
    tint: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
    border: '#bfdbfe',
    color: '#2563eb',
  },
  {
    title: '输入当前账号',
    description: '填写用户名密码，或手机号和验证码。',
    icon: <ApartmentOutlined />,
    tint: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '#bbf7d0',
    color: '#15803d',
  },
  {
    title: '登录后自动跳转',
    description: '系统会按当前账号权限进入对应首页。',
    icon: <ApiOutlined />,
    tint: 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)',
    border: '#ddd6fe',
    color: '#7c3aed',
  },
  {
    title: '无法进入时',
    description: '检查账号状态、空间角色和菜单权限。',
    icon: <ThunderboltOutlined />,
    tint: 'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)',
    border: '#fed7aa',
    color: '#ea580c',
  },
];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('password');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getUserHomePath(user), { replace: true });
    }
  }, [isAuthenticated, navigate, user]);

  const handlePasswordLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login('PASSWORD', { username: values.username, password: values.password });
      message.success('登录成功');
      const currentUser = useAuthStore.getState().user;
      navigate(getUserHomePath(currentUser));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async (values: { phone: string; smsCode: string }) => {
    setLoading(true);
    try {
      await login('SMS', { phone: values.phone, smsCode: values.smsCode });
      message.success('登录成功');
      const currentUser = useAuthStore.getState().user;
      navigate(getUserHomePath(currentUser));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const tabItems = [
    {
      key: 'password',
      label: '账号密码登录',
      children: (
        <Form onFinish={handlePasswordLogin} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
              placeholder="请输入用户名"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="请输入密码"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Checkbox>记住密码</Checkbox>
              <a style={{ color: '#2563eb', fontSize: 13 }}>忘记密码？</a>
            </div>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 48, fontSize: 15, fontWeight: 600 }}>
              登录并进入控制台
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'sms',
      label: '手机号登录',
      children: (
        <Form onFinish={handleSmsLogin} size="large" autoComplete="off">
          <Form.Item name="phone" rules={[{ required: true, message: '请输入手机号' }]}>
            <Input
              prefix={<MobileOutlined style={{ color: '#94a3b8' }} />}
              placeholder="请输入手机号"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="smsCode" rules={[{ required: true, message: '请输入验证码' }]}>
            <Input
              prefix={<SafetyCertificateOutlined style={{ color: '#94a3b8' }} />}
              placeholder="请输入验证码"
              style={loginInputStyle}
              suffix={<a style={{ color: '#2563eb', fontSize: 13, whiteSpace: 'nowrap' }}>获取验证码</a>}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 48, fontSize: 15, fontWeight: 600 }}>
              登录并进入控制台
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div
      className="login-page"
      style={{
        minHeight: '100vh',
        padding: 'clamp(20px, 3vw, 32px)',
        overflow: 'hidden',
        background: `
          radial-gradient(circle at top left, rgba(191,219,254,0.48) 0%, rgba(191,219,254,0) 34%),
          radial-gradient(circle at right 18%, rgba(148,163,184,0.2) 0%, rgba(148,163,184,0) 22%),
          linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)
        `,
      }}
    >
      <div
        style={{
          width: '100%',
          minHeight: 'calc(100vh - clamp(40px, 6vw, 64px))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="login-page-shell"
          style={{
            width: 'min(1260px, 100%)',
            minHeight: 'min(780px, calc(100vh - 80px))',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(380px, 430px)',
            borderRadius: 34,
            overflow: 'hidden',
            border: '1px solid #dbe4ee',
            background: '#f8fbff',
            boxShadow: '0 28px 72px rgba(15,23,42,0.12)',
          }}
        >
          <div
            className="login-page-overview"
            style={{
              padding: '42px 44px 36px',
              background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 28,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
                    border: '1px solid #bfdbfe',
                    color: '#2563eb',
                    boxShadow: '0 10px 22px rgba(37,99,235,0.12)',
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  F
                </div>
                <div>
                  <Text style={{ display: 'block', color: '#2563eb', fontWeight: 600, fontSize: 13 }}>
                    统一物联网控制台
                  </Text>
                  <Title level={1} style={{ margin: '6px 0 0', color: '#0f172a', fontSize: 34, lineHeight: 1.2 }}>
                    Firefly IoT
                  </Title>
                </div>
              </div>

              <Text style={{ maxWidth: 560, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
                使用账号密码或手机号登录。登录成功后会根据当前账号权限自动进入对应首页。
              </Text>

              <Space size={10} wrap>
                <Tag style={{ margin: 0, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                  系统运维空间
                </Tag>
                <Tag style={{ margin: 0, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                  租户业务空间
                </Tag>
                <Tag style={{ margin: 0, background: '#f8fafc', borderColor: '#dbe4ee', color: '#475569' }}>
                  API 与规则联动
                </Tag>
              </Space>
            </div>

            <div
              className="login-page-feature-grid"
              style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              }}
            >
              {featureCards.map((item) => (
                <Card
                  key={item.title}
                  bordered={false}
                  styles={{ body: { padding: 20 } }}
                  style={{
                    borderRadius: 24,
                    border: `1px solid ${item.border}`,
                    background: item.tint,
                    boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ffffff',
                        color: item.color,
                        fontSize: 20,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                        {item.title}
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        <Text style={{ color: '#64748b', lineHeight: 1.75 }}>
                          {item.description}
                        </Text>
                      </div>
                    </div>
                  </Space>
                </Card>
              ))}
            </div>

            <div
              style={{
                padding: 20,
                borderRadius: 24,
                border: '1px solid #dbe4ee',
                background: '#ffffff',
                boxShadow: '0 10px 24px rgba(15,23,42,0.04)',
              }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                  登录须知
                </Text>
                <Text style={{ color: '#64748b', lineHeight: 1.8 }}>
                  首次登录前请确认账号已启用，并已分配可访问的空间角色和菜单权限。
                </Text>
              </Space>
            </div>
          </div>

          <div
            className="login-page-form-panel"
            style={{
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(180deg, #ffffff 0%, #f7fafd 100%)',
            }}
          >
            <Card
              bordered={false}
              style={{
                width: '100%',
                maxWidth: 392,
                borderRadius: 28,
                border: '1px solid #dbe4ee',
                background: '#ffffff',
                boxShadow: '0 18px 42px rgba(15,23,42,0.08)',
              }}
              styles={{ body: { padding: 28 } }}
            >
              <Space direction="vertical" size={22} style={{ width: '100%' }}>
                <div>
                  <Tag style={{ margin: 0, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                    控制台登录
                  </Tag>
                  <Title level={3} style={{ margin: '14px 0 6px', color: '#0f172a' }}>
                    登录当前 Web 控制台
                  </Title>
                  <Text type="secondary">
                    选择一种方式完成登录。
                  </Text>
                </div>

                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    登录成功后自动进入当前账号首页
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date().getFullYear()} Firefly IoT
                  </Text>
                </div>
              </Space>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
