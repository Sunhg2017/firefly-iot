import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Space, Tabs, Typography, message } from 'antd';
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
            </div>

            <div className="login-page-network" aria-hidden="true">
              <div className="login-page-network__stage">
                <div className="login-page-network__halo login-page-network__halo--outer" />
                <div className="login-page-network__halo login-page-network__halo--inner" />

                <div className="login-page-network__orbit login-page-network__orbit--outer">
                  <span className="login-page-network__point login-page-network__point--top" />
                  <span className="login-page-network__point login-page-network__point--right" />
                </div>
                <div className="login-page-network__orbit login-page-network__orbit--middle">
                  <span className="login-page-network__point login-page-network__point--left" />
                  <span className="login-page-network__point login-page-network__point--upper-right" />
                </div>
                <div className="login-page-network__orbit login-page-network__orbit--inner">
                  <span className="login-page-network__point login-page-network__point--bottom" />
                </div>

                <span className="login-page-network__particle login-page-network__particle--one" />
                <span className="login-page-network__particle login-page-network__particle--two" />
                <span className="login-page-network__particle login-page-network__particle--three" />

                <div className="login-page-network__core">
                  <span className="login-page-network__core-ring" />
                  <span className="login-page-network__core-ring login-page-network__core-ring--delay" />
                  <div className="login-page-network__core-shell">
                    <DeploymentUnitOutlined />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="login-page-form-panel">
            <div className="login-page-form-card">
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <div>
                  <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                    登录控制台
                  </Title>
                </div>

                <Tabs className="login-page-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
              </Space>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
