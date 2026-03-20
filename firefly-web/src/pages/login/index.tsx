import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tabs, message, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import useAuthStore from '../../store/useAuthStore';
import { getUserHomePath } from '../../config/workspaceRoutes';

const loginInputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 6,
  background: '#fff',
};

/* ---------- SVG IoT illustration for left panel ---------- */
const IoTIllustration: React.FC = () => (
  <svg viewBox="0 0 480 360" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 420, opacity: 0.92 }}>
    {/* Central hub */}
    <circle cx="240" cy="180" r="44" fill="url(#hubGrad)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
    <text x="240" y="186" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700" fontFamily="monospace">IoT</text>
    {/* Orbiting rings */}
    <ellipse cx="240" cy="180" rx="120" ry="60" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="6 4" />
    <ellipse cx="240" cy="180" rx="180" ry="90" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 6" />
    {/* Device nodes */}
    {[
      { cx: 120, cy: 120, label: 'MQTT' },
      { cx: 360, cy: 120, label: 'HTTP' },
      { cx: 100, cy: 240, label: 'CoAP' },
      { cx: 380, cy: 240, label: 'Video' },
      { cx: 240, cy: 80, label: 'Gateway' },
      { cx: 240, cy: 280, label: 'Edge' },
    ].map((n, i) => (
      <g key={i}>
        <line x1="240" y1="180" x2={n.cx} y2={n.cy} stroke="rgba(99,179,237,0.25)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={n.cx} cy={n.cy} r="22" fill="url(#nodeGrad)" stroke="rgba(99,179,237,0.4)" strokeWidth="1.5" />
        <text x={n.cx} y={n.cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="8" fontWeight="600" fontFamily="sans-serif">{n.label}</text>
      </g>
    ))}
    {/* Floating particles */}
    {[
      { cx: 70, cy: 160, r: 3 }, { cx: 410, cy: 170, r: 2.5 },
      { cx: 160, cy: 60, r: 2 }, { cx: 320, cy: 300, r: 2 },
      { cx: 60, cy: 300, r: 1.5 }, { cx: 420, cy: 80, r: 1.5 },
    ].map((p, i) => (
      <circle key={`p${i}`} cx={p.cx} cy={p.cy} r={p.r} fill="rgba(99,179,237,0.5)">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
      </circle>
    ))}
    <defs>
      <radialGradient id="hubGrad"><stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#2d219b" /></radialGradient>
      <radialGradient id="nodeGrad"><stop offset="0%" stopColor="rgba(79,70,229,0.6)" /><stop offset="100%" stopColor="rgba(30,27,75,0.8)" /></radialGradient>
    </defs>
  </svg>
);

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
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入用户名"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入密码"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Checkbox>记住密码</Checkbox>
              <a style={{ color: '#4f46e5', fontSize: 13 }}>忘记密码?</a>
            </div>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
              }}
            >
              登 录
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
              prefix={<MobileOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入手机号"
              style={loginInputStyle}
            />
          </Form.Item>
          <Form.Item name="smsCode" rules={[{ required: true, message: '请输入验证码' }]}>
            <Input
              prefix={<SafetyCertificateOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入验证码"
              style={loginInputStyle}
              suffix={
                <a style={{ color: '#4f46e5', fontSize: 13, whiteSpace: 'nowrap' }}>获取验证码</a>
              }
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
              }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div className="login-page" style={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
      {/* ========== Left Brand Panel ========== */}
      <div
        style={{
          flex: '0 0 55%',
          background: 'linear-gradient(160deg, #0f0c29 0%, #1a1652 40%, #302b63 70%, #24243e 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 48px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decoration */}
        <div style={{ position: 'absolute', top: -120, left: -120, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,179,237,0.1) 0%, transparent 70%)' }} />
        {/* Grid pattern overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Curved divider at right edge */}
        <svg
          style={{ position: 'absolute', right: -1, top: 0, height: '100%', width: 200, zIndex: 2 }}
          viewBox="0 0 200 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M80 0 C-40 200, 160 350, 60 450 C-40 550, 170 700, 80 900 L200 900 L200 0 Z" fill="#f8f9fc" />
        </svg>

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 440 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 40 }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>F</span>
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>Firefly IoT</span>
          </div>

          {/* Illustration */}
          <IoTIllustration />

          {/* Tagline */}
          <div style={{ marginTop: 36 }}>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 600, margin: '0 0 12px', letterSpacing: 0.5 }}>
              企业级物联网设备管理平台
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              支持 MQTT / HTTP / CoAP / GB28181 多协议接入<br />
              设备管理 · 规则引擎 · 数据分析 · 视频监控
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 32 }}>
            {[
              { num: '10W+', label: '设备接入' },
              { num: '99.9%', label: '系统可用' },
              { num: '< 50ms', label: '响应延迟' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ color: '#818cf8', fontSize: 22, fontWeight: 700 }}>{s.num}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== Right Login Panel ========== */}
      <div
        style={{
          flex: '0 0 45%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#f8f9fc',
          padding: '40px',
          position: 'relative',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Welcome text */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px' }}>
              欢迎回来
            </h1>
            <p style={{ fontSize: 14, color: '#8c8c8c', margin: 0 }}>
              登录您的账号以继续使用 Firefly IoT 平台
            </p>
          </div>

          {/* Login form card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '32px 28px 24px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              style={{ marginTop: -8 }}
            />
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <span style={{ color: '#bfbfbf', fontSize: 12 }}>
              &copy; {new Date().getFullYear()} Firefly IoT Platform &mdash; Powered by React & Spring Cloud
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

