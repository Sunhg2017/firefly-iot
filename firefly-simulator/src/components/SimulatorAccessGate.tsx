import { useMemo, useState } from 'react';
import {
  Button,
  Card,
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
import { LoginOutlined, SettingOutlined } from '@ant-design/icons';
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

export default function SimulatorAccessGate() {
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const setActiveEnvironment = useSimWorkspaceStore((state) => state.setActiveEnvironment);
  const addEnvironment = useSimWorkspaceStore((state) => state.addEnvironment);
  const updateEnvironment = useSimWorkspaceStore((state) => state.updateEnvironment);
  const removeEnvironment = useSimWorkspaceStore((state) => state.removeEnvironment);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const saveSession = useSimWorkspaceStore((state) => state.saveSession);

  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];

  const [environmentDrawerOpen, setEnvironmentDrawerOpen] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [environmentForm] = Form.useForm();
  const [loginForm] = Form.useForm();

  const openCreateEnvironment = () => {
    setEditingEnvironmentId(null);
    environmentForm.setFieldsValue({
      name: '',
      gatewayBaseUrl: activeEnvironment.gatewayBaseUrl,
      protocolBaseUrl: activeEnvironment.protocolBaseUrl,
      mediaBaseUrl: activeEnvironment.mediaBaseUrl,
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
      mediaBaseUrl: target.mediaBaseUrl,
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

  const handleLogin = async () => {
    try {
      const values = await loginForm.validateFields();
      setLoginSubmitting(true);
      const result = await window.electronAPI.simulatorAuthLogin(
        activeEnvironment.gatewayBaseUrl,
        {
          username: values.username,
          password: values.password,
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
        background: 'linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)',
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
            width: 'min(1120px, 100%)',
            display: 'grid',
            gap: 24,
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            alignItems: 'stretch',
          }}
        >
          <Card
            style={{
              borderRadius: 28,
              border: '1px solid rgba(226,232,240,0.95)',
              background: 'linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(242,248,255,0.94) 100%)',
              boxShadow: '0 24px 54px rgba(15,23,42,0.08)',
            }}
            styles={{ body: { padding: 28 } }}
          >
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
              <div>
                <Title level={2} style={{ margin: 0, color: '#0f172a' }}>
                  设备模拟器
                </Title>
                <Text type="secondary">
                  先登录当前环境，再进入主工作台。
                </Text>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                }}
              >
                <div style={{ padding: '12px 14px', borderRadius: 18, background: '#f8fbff', border: '1px solid rgba(226,232,240,0.9)' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>当前环境</Text>
                  <div style={{ marginTop: 6, color: '#0f172a', fontWeight: 600 }}>{activeEnvironment.name}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 18, background: '#f8fbff', border: '1px solid rgba(226,232,240,0.9)' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>登录状态</Text>
                  <div style={{ marginTop: 6, color: '#0f172a', fontWeight: 600 }}>{buildSessionLabel(activeSession)}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 18, background: '#f8fbff', border: '1px solid rgba(226,232,240,0.9)' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>平台网关</Text>
                  <div style={{ marginTop: 6, color: '#0f172a', wordBreak: 'break-all' }}>{activeEnvironment.gatewayBaseUrl}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 18, background: '#f8fbff', border: '1px solid rgba(226,232,240,0.9)' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>协议服务</Text>
                  <div style={{ marginTop: 6, color: '#0f172a', wordBreak: 'break-all' }}>{activeEnvironment.protocolBaseUrl}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Space size={8} wrap>
                  {environments.map((environment) => (
                    <Tag
                      key={environment.id}
                      style={{
                        margin: 0,
                        borderRadius: 999,
                        paddingInline: 12,
                        background: environment.id === activeEnvironment.id ? '#eef2ff' : '#ffffff',
                        borderColor: environment.id === activeEnvironment.id ? '#c7d2fe' : '#e2e8f0',
                        color: environment.id === activeEnvironment.id ? '#4338ca' : '#475569',
                      }}
                    >
                      {environment.name}
                    </Tag>
                  ))}
                </Space>
                <Button icon={<SettingOutlined />} onClick={openCreateEnvironment}>
                  环境管理
                </Button>
              </div>
            </Space>
          </Card>

          <Card
            style={{
              borderRadius: 28,
              border: '1px solid rgba(226,232,240,0.95)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.96) 100%)',
              boxShadow: '0 24px 54px rgba(15,23,42,0.08)',
            }}
            styles={{ body: { padding: 28 } }}
          >
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
              <div>
                <Text strong style={{ color: '#0f172a', fontSize: 18 }}>登录当前环境</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">
                    进入主页面前，需要先完成环境登录。
                  </Text>
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 20,
                  border: '1px solid rgba(226,232,240,0.92)',
                  background: '#f8fbff',
                }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Select
                    value={activeEnvironment.id}
                    options={environments.map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))}
                    onChange={setActiveEnvironment}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    网关 {activeEnvironment.gatewayBaseUrl}
                  </Text>
                </Space>
              </div>

              <Form
                form={loginForm}
                layout="vertical"
                initialValues={{
                  username: activeSession?.user?.username || '',
                  password: '',
                }}
              >
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input placeholder="请输入用户名" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password placeholder="请输入密码" />
                </Form.Item>
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<LoginOutlined />}
                  loading={loginSubmitting}
                  onClick={() => void handleLogin()}
                >
                  登录并进入主页面
                </Button>
              </Form>
            </Space>
          </Card>
        </div>
      </div>

      <Drawer
        title="环境管理"
        open={environmentDrawerOpen}
        width={460}
        destroyOnClose
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
          <Card size="small" title={editingEnvironmentId ? '编辑环境' : '新增环境'} style={{ borderRadius: 18 }}>
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
              <Form.Item name="mediaBaseUrl" label="媒体服务地址" rules={[{ required: true, message: '请输入媒体服务地址' }]}>
                <Input placeholder="http://localhost:9040" />
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
              <Card key={environment.id} size="small" style={{ borderRadius: 18 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Space size={8} wrap>
                      <Text strong>{environment.name}</Text>
                      {environment.id === activeEnvironmentId ? (
                        <Tag style={{ margin: 0 }} color="processing">
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
                    <Text type="secondary" style={{ fontSize: 12 }}>媒体 {environment.mediaBaseUrl}</Text>
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
