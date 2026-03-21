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
  borderRadius: 24,
  border: '1px solid rgba(226,232,240,0.95)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(249,251,255,0.94) 100%)',
  boxShadow: '0 12px 30px rgba(15,23,42,0.06)',
  backdropFilter: 'blur(12px)',
};

const TOOL_CARD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '12px 14px',
  borderRadius: 16,
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

  const showRightRail = Boolean(screens.lg);
  const showTwoColumnSecondary = Boolean(screens.md && !screens.lg);
  const shellGap = 'clamp(12px, 1.2vw, 16px)';
  const shellPadding = 'clamp(12px, 1.5vw, 20px)';
  const headerPadding = 'clamp(16px, 1.7vw, 22px)';
  const railColumnWidth = 'minmax(292px, 332px)';
  const rightRailWidth = 'minmax(308px, 360px)';

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
    ? `${railColumnWidth} minmax(0, 1fr) ${rightRailWidth}`
    : showTwoColumnSecondary
      ? `${railColumnWidth} minmax(0, 1fr)`
      : '1fr';
  // Medium-width windows place tools/logs on the second row. Keep that row capped so
  // it does not consume all remaining height and collapse the device list/control area.
  const compactRailHeight = 'clamp(220px, 30vh, 300px)';
  const appShellStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: shellGap,
    height: '100%',
    minHeight: 0,
    padding: shellGap,
    borderRadius: 30,
    border: '1px solid rgba(226,232,240,0.96)',
    background: 'linear-gradient(180deg, rgba(248,251,255,0.98) 0%, rgba(243,247,252,0.96) 100%)',
    boxShadow: '0 22px 54px rgba(15,23,42,0.08)',
    overflow: 'hidden',
  };
  const desktopHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 'clamp(16px, 1.8vw, 24px)',
    padding: headerPadding,
    borderRadius: 24,
    border: '1px solid rgba(226,232,240,0.92)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)',
    boxShadow: '0 10px 26px rgba(15,23,42,0.05)',
  };
  const shortcutTagStyle: CSSProperties = {
    margin: 0,
    borderRadius: 999,
    paddingInline: 10,
    fontSize: 12,
  };

  const toolboxCard = (
    <Card
      style={PANEL_SHELL_STYLE}
      styles={{ body: { padding: 18 } }}
      title={(
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0f172a' }}>快捷工具</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按需打开压测、场景编排或数据模板。
          </Text>
        </Space>
      )}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>压力测试</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>批量发送并查看吞吐、成功率和耗时。</Text>
          </Space>
          <StressTestPanel />
        </div>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>场景编排</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>按步骤执行连接、发送、等待和断开。</Text>
          </Space>
          <ScenarioPanel />
        </div>
        <div style={TOOL_CARD_ROW_STYLE}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: '#0f172a' }}>数据模板</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>维护常用上报模板，减少重复录入。</Text>
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
            支持按当前设备筛选、导出和清空。
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
        height: '100dvh',
        minHeight: '100dvh',
        overflow: 'hidden',
        padding: shellPadding,
        background:
          'linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)',
      }}
    >
      <div style={appShellStyle}>
        <div style={desktopHeaderStyle}>
          <div style={{ flex: '1 1 420px', minWidth: 280, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
            <Space align="start" size={14}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  border: '1px solid rgba(191,219,254,0.9)',
                  background: 'linear-gradient(135deg, rgba(239,246,255,0.96) 0%, rgba(224,242,254,0.86) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb',
                  fontWeight: 700,
                  letterSpacing: 0.6,
                }}
              >
                IoT
              </div>
              <div style={{ minWidth: 0 }}>
                <Title
                  level={3}
                  style={{
                    margin: 0,
                    color: '#0f172a',
                    fontFamily: '"Microsoft YaHei UI", "PingFang SC", sans-serif',
                    fontSize: 28,
                    lineHeight: 1.2,
                  }}
                >
                  设备模拟器
                </Title>
                <Text style={{ display: 'block', marginTop: 6, color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
                  选择设备后开始连接、上报和协议调试。
                </Text>
              </div>
            </Space>

            <Space size={[8, 8]} wrap>
              <Tag style={{ ...shortcutTagStyle, borderColor: '#dbeafe', color: '#1d4ed8', background: '#eff6ff' }}>
                Ctrl+N 新建设备
              </Tag>
              <Tag style={{ ...shortcutTagStyle, borderColor: '#dcfce7', color: '#0f766e', background: '#f0fdf4' }}>
                Ctrl+Shift+C 批量连接
              </Tag>
              <Tag style={{ ...shortcutTagStyle, borderColor: '#fee2e2', color: '#b91c1c', background: '#fef2f2' }}>
                Ctrl+Shift+D 批量断开
              </Tag>
            </Space>
          </div>

          <div
            style={{
              flex: '0 1 500px',
              width: 'min(100%, 500px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
              gap: 10,
              alignContent: 'start',
            }}
          >
            {SUMMARY_CARD_META.map((item) => (
              <div
                key={item.key}
                style={{
                  padding: '10px 12px',
                  borderRadius: 18,
                  border: '1px solid rgba(226,232,240,0.88)',
                  background: item.background,
                  minHeight: 84,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.label}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: item.valueColor, lineHeight: 1.1 }}>
                  {summary[item.key]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: shellGap,
            gridTemplateColumns: mainGridColumns,
            alignItems: 'stretch',
            overflow: 'hidden',
          }}
        >
          <div style={{ ...PANEL_SHELL_STYLE, minHeight: 0 }}>
            <DeviceListPanel />
          </div>
          <div style={{ ...PANEL_SHELL_STYLE, minHeight: 0 }}>
            <DeviceControlPanel />
          </div>
          {showRightRail ? (
            <div style={{ minHeight: 0, display: 'grid', gap: shellGap, gridTemplateRows: 'minmax(214px, auto) minmax(0, 1fr)', overflow: 'hidden' }}>
              {toolboxCard}
              {logCard}
            </div>
          ) : null}
        </div>

        {!showRightRail ? (
          <div
            style={{
              flex: showTwoColumnSecondary ? `0 0 ${compactRailHeight}` : '0 0 auto',
              height: showTwoColumnSecondary ? compactRailHeight : undefined,
              minHeight: showTwoColumnSecondary ? 220 : 0,
              maxHeight: showTwoColumnSecondary ? 300 : undefined,
              display: 'grid',
              gap: shellGap,
              gridTemplateColumns: showTwoColumnSecondary ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
              alignItems: 'stretch',
              overflow: 'hidden',
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
