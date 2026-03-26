import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloudServerOutlined,
  DeploymentUnitOutlined,
  LockOutlined,
  LoginOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  getActiveEnvironment,
  useSimWorkspaceStore,
} from '../workspaceStore';

const { Text, Title } = Typography;

function buildSessionLabel(session?: {
  user?: {
    tenantName?: string;
    realName?: string | null;
    username?: string;
  };
} | null) {
  if (!session?.user) {
    return '未登录';
  }
  return `${session.user.tenantName || '当前租户'} / ${session.user.realName || session.user.username || '当前用户'}`;
}

function buildSessionUserName(session?: {
  user?: {
    realName?: string | null;
    username?: string;
  };
} | null) {
  return session?.user?.realName || session?.user?.username || '未登录';
}

function buildSessionTenantName(session?: {
  user?: {
    tenantName?: string;
  };
} | null) {
  return session?.user?.tenantName || '未登录';
}

type LoginFormValues = {
  username: string;
  password: string;
  rememberMe: boolean;
};

export default function SimulatorAccessGate() {
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const setActiveEnvironment = useSimWorkspaceStore((state) => state.setActiveEnvironment);
  const addEnvironment = useSimWorkspaceStore((state) => state.addEnvironment);
  const updateEnvironment = useSimWorkspaceStore((state) => state.updateEnvironment);
  const removeEnvironment = useSimWorkspaceStore((state) => state.removeEnvironment);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const rememberedLogins = useSimWorkspaceStore((state) => state.rememberedLogins);
  const saveSession = useSimWorkspaceStore((state) => state.saveSession);
  const rememberLogin = useSimWorkspaceStore((state) => state.rememberLogin);
  const clearRememberedLogin = useSimWorkspaceStore((state) => state.clearRememberedLogin);

  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];
  const activeRememberedLogin = rememberedLogins[activeEnvironment.id];

  const [environmentDrawerOpen, setEnvironmentDrawerOpen] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [environmentForm] = Form.useForm();
  const [loginForm] = Form.useForm<LoginFormValues>();

  useEffect(() => {
    loginForm.setFieldsValue({
      username: activeSession?.user?.username || activeRememberedLogin?.username || '',
      password: '',
      rememberMe: Boolean(activeRememberedLogin),
    });
  }, [activeEnvironment.id, activeRememberedLogin, activeSession?.user?.username, loginForm]);

  const openEnvironmentManager = () => {
    setEditingEnvironmentId(null);
    environmentForm.resetFields();
    setEnvironmentDrawerOpen(true);
  };

  const openCreateEnvironment = () => {
    setEditingEnvironmentId(null);
    environmentForm.setFieldsValue({
      name: '',
      gatewayBaseUrl: activeEnvironment.gatewayBaseUrl,
      protocolBaseUrl: activeEnvironment.protocolBaseUrl,
      mqttBrokerUrl: activeEnvironment.mqttBrokerUrl,
    });
    setEnvironmentDrawerOpen(true);
  };

  const openEditEnvironment = (environmentId: string) => {
    const target = environments.find((item) => item.id === environmentId);
    if (!target) {
      return;
    }
    setEditingEnvironmentId(environmentId);
    environmentForm.setFieldsValue({
      name: target.name,
      gatewayBaseUrl: target.gatewayBaseUrl,
      protocolBaseUrl: target.protocolBaseUrl,
      mqttBrokerUrl: target.mqttBrokerUrl,
    });
    setEnvironmentDrawerOpen(true);
  };

  const handleSaveEnvironment = async () => {
    try {
      const values = await environmentForm.validateFields();
      if (editingEnvironmentId) {
        updateEnvironment(editingEnvironmentId, values);
        message.success('环境已更新');
      } else {
        const newEnvironmentId = addEnvironment(values);
        setActiveEnvironment(newEnvironmentId);
        message.success('环境已新增');
      }
      setEditingEnvironmentId(null);
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      message.error(error?.message || '环境保存失败');
    }
  };

  const handleDeleteEnvironment = (environmentId: string) => {
    removeEnvironment(environmentId);
    if (editingEnvironmentId === environmentId) {
      setEditingEnvironmentId(null);
      environmentForm.resetFields();
    }
    message.success('环境已删除');
  };

  const handleLogin = async (values?: LoginFormValues) => {
    try {
      const formValues = values || await loginForm.validateFields();
      setLoginSubmitting(true);
      const result = await window.electronAPI.simulatorAuthLogin(
        activeEnvironment.gatewayBaseUrl,
        {
          username: formValues.username,
          password: formValues.password,
          loginMethod: 'PASSWORD',
          fingerprint: `simulator:${activeEnvironment.id}`,
          userAgent: navigator.userAgent,
        },
      );

      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        throw new Error(result?.message || '登录失败');
      }

      const payload = result.data || {};
      if (!payload.accessToken || !payload.user) {
        throw new Error('登录响应缺少 accessToken');
      }

      if (formValues.rememberMe) {
        rememberLogin(activeEnvironment.id, formValues.username);
      } else {
        clearRememberedLogin(activeEnvironment.id);
      }

      saveSession(activeEnvironment.id, {
        accessToken: String(payload.accessToken),
        refreshToken: payload.refreshToken ? String(payload.refreshToken) : null,
        loginAt: new Date().toISOString(),
        user: {
          id: Number(payload.user.id || 0),
          username: String(payload.user.username || ''),
          realName: typeof payload.user.realName === 'string' ? payload.user.realName : null,
          tenantId: payload.user.tenantId != null ? String(payload.user.tenantId) : '',
          tenantName: String(payload.user.tenantName || ''),
          userType: String(payload.user.userType || ''),
        },
      });

      loginForm.resetFields();
      message.success('登录成功');
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      message.error(error?.message || '登录失败');
    } finally {
      setLoginSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        height: '100dvh',
        padding: 'clamp(20px, 3vw, 32px)',
        overflow: 'hidden',
        background: `
          radial-gradient(circle at top left, rgba(191,219,254,0.55) 0%, rgba(191,219,254,0) 34%),
          radial-gradient(circle at right 12%, rgba(148,163,184,0.18) 0%, rgba(148,163,184,0) 24%),
          linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)
        `,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 'min(1320px, 100%)',
            height: 'min(820px, 100%)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(380px, 450px)',
            borderRadius: 36,
            overflow: 'hidden',
            border: '1px solid rgba(226,232,240,0.96)',
            background: 'rgba(255,255,255,0.76)',
            boxShadow: '0 28px 72px rgba(15,23,42,0.12)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div
            style={{
              position: 'relative',
              padding: '40px 42px 36px',
              background: `
                radial-gradient(circle at top left, rgba(219,234,254,0.82) 0%, rgba(219,234,254,0) 30%),
                linear-gradient(180deg, rgba(248,251,255,0.92) 0%, rgba(237,244,251,0.9) 100%)
              `,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 32,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '26px auto auto 26px',
                width: 148,
                height: 148,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(191,219,254,0.38) 0%, rgba(191,219,254,0) 72%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
                    color: '#2563eb',
                    boxShadow: 'inset 0 0 0 1px rgba(191,219,254,0.95)',
                  }}
                >
                  <DeploymentUnitOutlined style={{ fontSize: 26 }} />
                </div>
                <div>
                  <Text style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
                    租户设备接入工具
                  </Text>
                  <Title level={1} style={{ margin: '6px 0 0', color: '#0f172a', fontSize: 34, lineHeight: 1.2 }}>
                    设备模拟器
                  </Title>
                </div>
              </div>
              <Text style={{ maxWidth: 560, color: '#475569', fontSize: 15, lineHeight: 1.75 }}>
                选择当前环境并完成登录后进入主工作台。
              </Text>
            </div>

            <div
              style={{
                position: 'relative',
                borderRadius: 30,
                border: '1px solid rgba(226,232,240,0.94)',
                background: 'rgba(255,255,255,0.74)',
                boxShadow: '0 18px 44px rgba(15,23,42,0.06)',
                padding: 24,
              }}
            >
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <Text strong style={{ color: '#0f172a', fontSize: 18 }}>
                      当前环境概览
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">可切换环境并查看当前接入地址。</Text>
                    </div>
                  </div>
                  <Button icon={<SettingOutlined />} onClick={openEnvironmentManager}>
                    环境管理
                  </Button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 14,
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  }}
                >
                  <div
                    style={{
                      minHeight: 118,
                      padding: '18px 18px 16px',
                      borderRadius: 24,
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
                      border: '1px solid rgba(226,232,240,0.92)',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前环境
                    </Text>
                    <div style={{ marginTop: 10, color: '#0f172a', fontSize: 24, fontWeight: 700 }}>
                      {activeEnvironment.name}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Tag
                        style={{
                          margin: 0,
                          borderRadius: 999,
                          paddingInline: 12,
                          color: '#1d4ed8',
                          background: '#eff6ff',
                          borderColor: '#bfdbfe',
                        }}
                      >
                        已配置 {environments.length} 个环境
                      </Tag>
                    </div>
                  </div>

                  <div
                    style={{
                      minHeight: 118,
                      padding: '18px 18px 16px',
                      borderRadius: 24,
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
                      border: '1px solid rgba(226,232,240,0.92)',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      登录状态
                    </Text>
                    <div style={{ marginTop: 10, color: '#0f172a', fontSize: 24, fontWeight: 700 }}>
                      {buildSessionUserName(activeSession)}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary">{buildSessionTenantName(activeSession)}</Text>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 14,
                    gridTemplateColumns: 'minmax(0, 1.25fr) minmax(220px, 0.75fr)',
                  }}
                >
                  <div
                    style={{
                      padding: '18px 18px 16px',
                      borderRadius: 24,
                      background: 'linear-gradient(180deg, rgba(248,251,255,0.96) 0%, rgba(239,246,255,0.98) 100%)',
                      border: '1px solid rgba(226,232,240,0.92)',
                    }}
                  >
                    <Space size={10} align="start">
                      <CloudServerOutlined style={{ color: '#2563eb', fontSize: 18, marginTop: 2 }} />
                      <div style={{ minWidth: 0 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          平台网关
                        </Text>
                        <div style={{ marginTop: 8, color: '#0f172a', fontWeight: 600, wordBreak: 'break-all', lineHeight: 1.7 }}>
                          {activeEnvironment.gatewayBaseUrl}
                        </div>
                      </div>
                    </Space>
                  </div>

                  <div
                    style={{
                      padding: '18px 18px 16px',
                      borderRadius: 24,
                      background: 'linear-gradient(180deg, rgba(248,251,255,0.96) 0%, rgba(255,255,255,0.98) 100%)',
                      border: '1px solid rgba(226,232,240,0.92)',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前会话
                    </Text>
                    <div style={{ marginTop: 8, color: '#0f172a', lineHeight: 1.7 }}>
                      {buildSessionLabel(activeSession)}
                    </div>
                  </div>
                </div>
              </Space>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(247,250,252,0.92) 100%)',
            }}
          >
            <Card
              style={{
                width: '100%',
                maxWidth: 386,
                borderRadius: 30,
                border: '1px solid rgba(226,232,240,0.95)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,251,255,0.96) 100%)',
                boxShadow: '0 22px 52px rgba(15,23,42,0.08)',
              }}
              styles={{ body: { padding: 28 } }}
            >
              <Space direction="vertical" size={22} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <Text strong style={{ color: '#0f172a', fontSize: 22 }}>
                      登录当前环境
                    </Text>
                    <div style={{ marginTop: 6 }}>
                      <Text type="secondary">登录成功后进入主页面。</Text>
                    </div>
                  </div>
                  <Tag
                    style={{
                      margin: 0,
                      borderRadius: 999,
                      paddingInline: 12,
                      color: '#475569',
                      background: '#f8fafc',
                      borderColor: '#e2e8f0',
                    }}
                  >
                    未登录
                  </Tag>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: '1px solid rgba(226,232,240,0.92)',
                    background: 'linear-gradient(180deg, #f8fbff 0%, #f1f7ff 100%)',
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前环境
                    </Text>
                    <Select
                      size="large"
                      value={activeEnvironment.id}
                      options={environments.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))}
                      onChange={setActiveEnvironment}
                    />
                    <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.7, wordBreak: 'break-all' }}>
                      网关 {activeEnvironment.gatewayBaseUrl}
                    </Text>
                  </Space>
                </div>

                <Form
                  form={loginForm}
                  layout="vertical"
                  onFinish={(values) => void handleLogin(values)}
                  initialValues={{ rememberMe: Boolean(activeRememberedLogin) }}
                >
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" />
                  </Form.Item>
                  <Form.Item name="rememberMe" valuePropName="checked" style={{ marginBottom: 18 }}>
                    <Checkbox>记住我</Checkbox>
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    icon={<LoginOutlined />}
                    loading={loginSubmitting}
                    style={{
                      height: 48,
                      borderRadius: 14,
                      background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                      boxShadow: '0 12px 24px rgba(37,99,235,0.22)',
                    }}
                  >
                    登录并进入主页面
                  </Button>
                </Form>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {buildSessionLabel(activeSession)}
                  </Text>
                  <Button type="link" icon={<SettingOutlined />} onClick={openEnvironmentManager}>
                    环境管理
                  </Button>
                </div>
              </Space>
            </Card>
          </div>
        </div>
      </div>

      <Drawer
        title={(
          <Space direction="vertical" size={0}>
            <Text strong style={{ color: '#0f172a' }}>
              环境管理
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              维护平台网关、协议服务、媒体服务和 MQTT Broker。
            </Text>
          </Space>
        )}
        open={environmentDrawerOpen}
        width={520}
        destroyOnClose
        styles={{ body: { padding: 20, background: '#f6f8fb' } }}
        onClose={() => {
          setEnvironmentDrawerOpen(false);
          setEditingEnvironmentId(null);
          environmentForm.resetFields();
        }}
        extra={(
          <Button type="link" onClick={openCreateEnvironment}>
            新增环境
          </Button>
        )}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            size="small"
            title={editingEnvironmentId ? '编辑环境' : '新增环境'}
            style={{ borderRadius: 20, borderColor: 'rgba(226,232,240,0.96)' }}
            styles={{ body: { padding: 18 } }}
          >
            <Form form={environmentForm} layout="vertical">
              <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请输入环境名称' }]}>
                <Input placeholder="例如：测试环境" />
              </Form.Item>
              <Form.Item name="gatewayBaseUrl" label="平台网关地址" rules={[{ required: true, message: '请输入平台网关地址' }]}>
                <Input placeholder="http://localhost:8080" />
              </Form.Item>
              <Form.Item name="protocolBaseUrl" label="协议服务地址" rules={[{ required: true, message: '请输入协议服务地址' }]}>
                <Input placeholder="http://localhost:9070" />
              </Form.Item>
              <Form.Item name="mqttBrokerUrl" label="MQTT Broker 地址" rules={[{ required: true, message: '请输入 MQTT Broker 地址' }]}>
                <Input placeholder="mqtt://localhost:1883" />
              </Form.Item>
              <Space>
                <Button type="primary" onClick={() => void handleSaveEnvironment()}>
                  保存环境
                </Button>
                {editingEnvironmentId ? (
                  <Button
                    onClick={() => {
                      setEditingEnvironmentId(null);
                      environmentForm.resetFields();
                    }}
                  >
                    取消编辑
                  </Button>
                ) : null}
              </Space>
            </Form>
          </Card>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {environments.map((environment) => (
              <Card
                key={environment.id}
                size="small"
                style={{ borderRadius: 20, borderColor: 'rgba(226,232,240,0.96)' }}
                styles={{ body: { padding: 18 } }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Space size={8} wrap>
                      <Text strong>{environment.name}</Text>
                      {environment.id === activeEnvironmentId ? (
                        <Tag style={{ margin: 0, borderRadius: 999 }} color="processing">
                          当前
                        </Tag>
                      ) : null}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {buildSessionLabel(sessions[environment.id])}
                    </Text>
                  </div>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>网关 {environment.gatewayBaseUrl}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>协议 {environment.protocolBaseUrl}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>Broker {environment.mqttBrokerUrl}</Text>
                  </Space>
                  <Space size={8} wrap>
                    {environment.id !== activeEnvironmentId ? (
                      <Button size="small" onClick={() => setActiveEnvironment(environment.id)}>
                        设为当前
                      </Button>
                    ) : null}
                    <Button size="small" onClick={() => openEditEnvironment(environment.id)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除当前环境吗？"
                      disabled={environments.length <= 1}
                      onConfirm={() => handleDeleteEnvironment(environment.id)}
                    >
                      <Button size="small" danger disabled={environments.length <= 1}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </Card>
            ))}
          </Space>
        </Space>
      </Drawer>
    </div>
  );
}
