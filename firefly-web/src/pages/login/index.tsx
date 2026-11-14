import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Form, Input, Space, Tabs, Typography, message } from 'antd';
import {
  DeploymentUnitOutlined,
  MessageOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../store/useAuthStore';
import { getUserHomePath } from '../../config/workspaceRoutes';
import { authApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { consumeSessionExpired } from '../../utils/authStorage';

const { Text, Title } = Typography;

interface OauthLoginProvider {
  provider: string;
  displayName: string;
  enabled: boolean;
  webAuthorizeSupported: boolean;
}

const loginInputStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  background: '#ffffff',
};

/** Only same-origin absolute paths may be used as a post-login target. */
function normalizeRedirect(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  return raw;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('password');
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OauthLoginProvider[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(() => (
    searchParams.get('expired') === '1' || consumeSessionExpired()
  ));

  const redirectPath = normalizeRedirect(searchParams.get('redirect'));
  const targetPath = redirectPath ?? getUserHomePath(user);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(targetPath, { replace: true });
    }
  }, [isAuthenticated, navigate, targetPath]);

  useEffect(() => {
    const loadOauthProviders = async () => {
      try {
        const res = await authApi.listOauthProviders();
        const providers = Array.isArray(res.data?.data) ? res.data.data : [];
        setOauthProviders(
          providers.filter((item: unknown): item is OauthLoginProvider => {
            if (!item || typeof item !== 'object') {
              return false;
            }
            const candidate = item as Partial<OauthLoginProvider>;
            return Boolean(candidate.enabled)
              && Boolean(candidate.webAuthorizeSupported)
              && typeof candidate.provider === 'string'
              && typeof candidate.displayName === 'string';
          }),
        );
      } catch {
        setOauthProviders([]);
      }
    };

    void loadOauthProviders();
  }, []);

  const handlePasswordLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    setLoginError(null);
    try {
      await login('PASSWORD', { username: values.username, password: values.password });
      const currentUser = useAuthStore.getState().user;
      navigate(normalizeRedirect(searchParams.get('redirect')) ?? getUserHomePath(currentUser), { replace: true });
    } catch (err: unknown) {
      setLoginError(getErrorMessage(err, '登录失败，请检查账号和密码'));
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async (values: { phone: string; smsCode: string }) => {
    setLoading(true);
    setLoginError(null);
    try {
      await login('SMS', { phone: values.phone, smsCode: values.smsCode });
      const currentUser = useAuthStore.getState().user;
      navigate(normalizeRedirect(searchParams.get('redirect')) ?? getUserHomePath(currentUser), { replace: true });
    } catch (err: unknown) {
      setLoginError(getErrorMessage(err, '验证码登录失败，请检查手机号和验证码'));
    } finally {
      setLoading(false);
    }
  };

  const tabItems = [
    {
      key: 'password',
      label: '账号密码登录',
      children: (
        <Form onFinish={handlePasswordLogin} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#64748b' }} />}
              placeholder="请输入用户名"
              autoComplete="username"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#64748b' }} />}
              placeholder="请输入密码"
              autoComplete="current-password"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 48, fontSize: 15, fontWeight: 600 }}>
              登录并进入控制台
            </Button>
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            忘记密码请联系平台管理员重置，或使用已开通的第三方账号登录。
          </Typography.Text>
        </Form>
      ),
    },
    {
      key: 'sms',
      label: '手机号登录',
      children: (
        <Form onFinish={handleSmsLogin} size="large">
          <Form.Item
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入 11 位有效手机号' },
            ]}
          >
            <Input
              prefix={<MobileOutlined style={{ color: '#64748b' }} />}
              placeholder="请输入手机号"
              autoComplete="tel"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="smsCode" rules={[{ required: true, message: '请输入验证码' }]}>
            <Input
              prefix={<SafetyCertificateOutlined style={{ color: '#64748b' }} />}
              placeholder="请输入验证码"
              autoComplete="one-time-code"
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

  const startOauthLogin = async (provider: string) => {
    setOauthLoadingProvider(provider);
    try {
      const redirectUri = `${window.location.origin}/login/oauth/callback?provider=${encodeURIComponent(provider)}`;
      const res = await authApi.buildOauthAuthorizeUrl({
        provider,
        action: 'LOGIN',
        redirectUri,
      });
      const authorizeUrl = res.data?.data?.authorizeUrl;
      if (typeof authorizeUrl !== 'string' || !authorizeUrl) {
        throw new Error('未获取到授权地址');
      }
      window.location.href = authorizeUrl;
    } catch (error) {
      message.error(getErrorMessage(error, '拉起第三方登录失败'));
      setOauthLoadingProvider(null);
    }
  };

  const oauthButtons = oauthProviders.map((provider) => ({
    ...provider,
    icon: provider.provider === 'WECHAT'
      ? <WechatOutlined />
      : <MessageOutlined />,
  }));

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

                {sessionExpired ? (
                  <Alert
                    type="warning"
                    showIcon
                    closable
                    message="登录状态已过期"
                    description="为保障账号安全，请重新登录后继续操作。"
                    onClose={() => setSessionExpired(false)}
                  />
                ) : null}

                {loginError ? (
                  <Alert
                    type="error"
                    showIcon
                    closable
                    message={loginError}
                    onClose={() => setLoginError(null)}
                  />
                ) : null}

                <Tabs className="login-page-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

                {oauthButtons.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Text style={{ color: '#64748b' }}>其他登录方式</Text>
                    {oauthButtons.map((provider) => (
                      <Button
                        key={provider.provider}
                        block
                        icon={provider.icon}
                        loading={oauthLoadingProvider === provider.provider}
                        onClick={() => void startOauthLogin(provider.provider)}
                        style={{ height: 44, borderRadius: 12 }}
                      >
                        {provider.displayName}
                      </Button>
                    ))}
                  </Space>
                ) : null}
              </Space>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
