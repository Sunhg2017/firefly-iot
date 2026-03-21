import { useEffect, useMemo, type CSSProperties } from 'react';
import { Card, Grid, Space, Tag, Typography } from 'antd';
import { useSimStore } from './store';
import { buildMqttInboundLogMessage } from './utils/mqtt';
import { restorePersistedConnections } from './utils/runtime';
import {
  DeviceListPanel,
  DeviceControlPanel,
  LogPanel,
  StressTestPanel,
  ScenarioPanel,
  TemplateEditorPanel,
} from './components';

const { Text, Title } = Typography;

const SUMMARY_CARD_META = [
  {
    key: 'total',
    label: '设备总数',
    valueColor: '#1d4ed8',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0.96))',
  },
  {
    key: 'online',
    label: '在线设备',
    valueColor: '#0f766e',
    background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(255,255,255,0.96))',
  },
  {
    key: 'auto',
    label: '自动上报',
    valueColor: '#7c3aed',
    background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(255,255,255,0.96))',
  },
  {
    key: 'error',
    label: '异常设备',
    valueColor: '#dc2626',
    background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(255,255,255,0.96))',
  },
] as const;

const PANEL_SHELL_STYLE: CSSProperties = {
  minHeight: 0,
  overflow: 'hidden',
  borderRadius: 28,
  border: '1px solid rgba(226,232,240,0.95)',
  background: 'rgba(255,255,255,0.94)',
  boxShadow: '0 18px 46px rgba(15,23,42,0.08)',
  backdropFilter: 'blur(12px)',
};

const TOOL_CARD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 16px',
  borderRadius: 18,
  border: '1px solid rgba(226,232,240,0.9)',
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
};

export default function App() {
  const devices = useSimStore((state) => state.devices);
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.key === 'n') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('sim:add-device'));
      }
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('sim:batch-connect'));
      }
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('sim:batch-disconnect'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const restore = () => {
      void restorePersistedConnections();
    };

    if (useSimStore.persist.hasHydrated()) {
      restore();
      return undefined;
    }

    const unsubscribe = useSimStore.persist.onFinishHydration(() => {
      restore();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubMsg = window.electronAPI.onMqttMessage((id: string, topic: string, payload: string) => {
      const { addLog, devices: latestDevices } = useSimStore.getState();
      const device = latestDevices.find((item) => item.id === id);
      addLog(id, device?.name || id, 'info', buildMqttInboundLogMessage(topic, payload));
    });

    const unsubDisconnect = window.electronAPI.onMqttDisconnected((id: string) => {
      const { addLog, updateDevice, devices: latestDevices } = useSimStore.getState();
      const device = latestDevices.find((item) => item.id === id);
      updateDevice(id, { status: 'offline' });
      addLog(id, device?.name || id, 'warn', 'MQTT 连接已断开');
    });

    const unsubError = window.electronAPI.onMqttError((id: string, error: string) => {
      const { addLog, devices: latestDevices } = useSimStore.getState();
      const device = latestDevices.find((item) => item.id === id);
      addLog(id, device?.name || id, 'error', `MQTT 错误: ${error}`);
    });

    return () => {
      unsubMsg();
      unsubDisconnect();
      unsubError();
    };
  }, []);

  const showRightRail = Boolean(screens.xl);
  const showTwoColumnSecondary = Boolean(screens.lg);

  const summary = useMemo(
    () => ({
      total: devices.length,
      online: devices.filter((item) => item.status === 'online').length,
      auto: devices.filter((item) => item.autoReport).length,
      error: devices.filter((item) => item.status === 'error').length,
    }),
    [devices],
  );

  const mainGridColumns = showRightRail
    ? '332px minmax(0, 1fr) 360px'
    : showTwoColumnSecondary
      ? '332px minmax(0, 1fr)'
      : '1fr';

  const toolboxCard = (
    <Card
      style={PANEL_SHELL_STYLE}
      styles={{ body: { padding: 18 } }}
      title={(
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0f172a' }}>快捷工具</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            把低频但重要的批量能力集中到一处，避免它们和主控制区抢焦点。
          </Text>
        </Space>
      )}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>压力测试</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>批量发送并统计吞吐、成功率和耗时。</Text>
          </Space>
          <StressTestPanel />
        </div>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>场景编排</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>按步骤串联连接、发送、等待和断开动作。</Text>
          </Space>
          <ScenarioPanel />
        </div>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>数据模板</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>维护常用属性、事件模板，减少重复录入。</Text>
          </Space>
          <TemplateEditorPanel />
        </div>
      </Space>
    </Card>
  );

  const logCard = (
    <Card
      style={{ ...PANEL_SHELL_STYLE, height: '100%' }}
      styles={{ body: { padding: 0, height: '100%' } }}
      title={(
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0f172a' }}>运行日志</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            日志沉到侧边区，主控制区只保留当前设备的操作与结果。
          </Text>
        </Space>
      )}
    >
      <LogPanel />
    </Card>
  );

  return (
    <div
      style={{
        height: '100vh',
        minHeight: '100vh',
        overflow: 'hidden',
        padding: 20,
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 22%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 20%), linear-gradient(180deg, #eff5f9 0%, #e7eef7 100%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0 }}>
        <Card
          style={{
            borderRadius: 32,
            border: '1px solid rgba(226,232,240,0.92)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(245,249,255,0.94) 100%)',
            boxShadow: '0 18px 46px rgba(15,23,42,0.08)',
          }}
          styles={{ body: { padding: 22 } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 420px', minWidth: 280 }}>
              <Title
                level={2}
                style={{
                  margin: 0,
                  color: '#0f172a',
                  fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
                }}
              >
                设备模拟器
              </Title>
              <Text style={{ display: 'block', marginTop: 10, color: '#475569', fontSize: 14, lineHeight: 1.8 }}>
                把设备管理、数据上报、协议调试和运行日志收拢到一张工作台里。主操作区保持居中，日志与批量工具下沉到侧栏，核心信息能在第一屏读完。
              </Text>
              <Space size={[8, 8]} wrap style={{ marginTop: 16 }}>
                <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, borderColor: '#dbeafe', color: '#1d4ed8', background: '#eff6ff' }}>
                  Ctrl+N 新建设备
                </Tag>
                <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, borderColor: '#dcfce7', color: '#0f766e', background: '#f0fdf4' }}>
                  Ctrl+Shift+C 批量连接
                </Tag>
                <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, borderColor: '#fee2e2', color: '#b91c1c', background: '#fef2f2' }}>
                  Ctrl+Shift+D 批量断开
                </Tag>
              </Space>
            </div>

            <div
              style={{
                flex: '0 1 520px',
                width: 'min(100%, 520px)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
                gap: 12,
              }}
            >
              {SUMMARY_CARD_META.map((item) => (
                <div
                  key={item.key}
                  style={{
                    padding: '14px 14px 12px',
                    borderRadius: 22,
                    border: '1px solid rgba(226,232,240,0.86)',
                    background: item.background,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.label}
                  </Text>
                  <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, color: item.valueColor }}>
                    {summary[item.key]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: mainGridColumns,
            alignItems: 'stretch',
          }}
        >
          <div style={PANEL_SHELL_STYLE}>
            <DeviceListPanel />
          </div>
          <div style={PANEL_SHELL_STYLE}>
            <DeviceControlPanel />
          </div>
          {showRightRail ? (
            <div style={{ minHeight: 0, display: 'grid', gap: 16, gridTemplateRows: 'auto minmax(0, 1fr)' }}>
              {toolboxCard}
              {logCard}
            </div>
          ) : null}
        </div>

        {!showRightRail ? (
          <div
            style={{
              minHeight: showTwoColumnSecondary ? 260 : 0,
              display: 'grid',
              gap: 16,
              gridTemplateColumns: showTwoColumnSecondary ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
            }}
          >
            {toolboxCard}
            {logCard}
          </div>
        ) : null}
      </div>
    </div>
  );
}
