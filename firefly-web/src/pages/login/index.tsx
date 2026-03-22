import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Space, Tabs, Typography, message } from 'antd';
import {
  DeploymentUnitOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../store/useAuthStore';
import { getUserHomePath } from '../../config/workspaceRoutes';

const { Text, Title } = Typography;

const loginInputStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  background: '#ffffff',
};

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
          radial-gradient(circle at right 16%, rgba(148,163,184,0.18) 0%, rgba(148,163,184,0) 22%),
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
        <div className="login-page-shell">
          <div className="login-page-overview">
            <div className="login-page-overview__copy">
              <div className="login-page-overview__brand">
                <div className="login-page-overview__logo">
                  <DeploymentUnitOutlined />
                </div>
                <div>
                  <Text className="login-page-overview__eyebrow">统一物联网控制台</Text>
                  <Title level={1} className="login-page-overview__title">Firefly IoT</Title>
                </div>
              </div>

              <Text className="login-page-overview__description">
                使用已开通账号登录。登录成功后会根据当前账号权限自动进入对应首页。
              </Text>
            </div>

            <div className="login-page-note">
              <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                登录提示
              </Text>
              <Text style={{ color: '#64748b', lineHeight: 1.8 }}>
                如无法进入，请联系管理员确认账号状态、空间角色和菜单权限。
              </Text>
            </div>
          </div>

          <div className="login-page-form-panel">
            <Card className="login-page-form-card" bordered={false}>
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <div>
                  <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                    登录控制台
                  </Title>
                  <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                    选择一种方式完成登录。
                  </Text>
                </div>

                <Tabs className="login-page-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

                <Text type="secondary" style={{ fontSize: 12 }}>
                  登录成功后自动进入当前账号首页
                </Text>
              </Space>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
