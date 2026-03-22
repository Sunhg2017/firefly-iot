import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Card, Space, Typography } from 'antd';
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
  SimulatorAccessGate,
} from './components';
import { getActiveEnvironment, useSimWorkspaceStore } from './workspaceStore';

const { Text } = Typography;

const FRAME_WIDTH = 1760;
const FRAME_HEIGHT = 960;
const STAGE_PADDING = 8;
const MAX_STAGE_SCALE = 1.2;

const PANEL_SHELL_STYLE: CSSProperties = {
  minHeight: 0,
  overflow: 'hidden',
  borderRadius: 24,
  border: '1px solid #dbe4ee',
  background: '#ffffff',
  boxShadow: '0 10px 22px rgba(15,23,42,0.04)',
};

const TOOL_CARD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid #e2e8f0',
  background: '#f8fbff',
};

function readViewportSize() {
  if (typeof window === 'undefined') {
    return {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export default function App() {
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];
  const [viewportSize, setViewportSize] = useState(readViewportSize);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize(readViewportSize());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!activeSession?.accessToken) {
      return undefined;
    }
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
  }, [activeSession?.accessToken]);

  useEffect(() => {
    if (!activeSession?.accessToken) {
      return undefined;
    }
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
  }, [activeSession?.accessToken]);

  useEffect(() => {
    if (!activeSession?.accessToken || !window.electronAPI) {
      return undefined;
    }
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
  }, [activeSession?.accessToken]);

  if (!activeSession?.accessToken) {
    return <SimulatorAccessGate />;
  }

  const shellGap = 16;
  const appShellStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: shellGap,
    width: '100%',
    height: '100%',
    minHeight: 0,
    padding: shellGap,
    borderRadius: 26,
    border: '1px solid #dbe4ee',
    background: '#f3f7fb',
    boxShadow: '0 14px 36px rgba(15,23,42,0.06)',
    overflow: 'hidden',
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

  const availableWidth = Math.max(320, viewportSize.width - STAGE_PADDING * 2);
  const availableHeight = Math.max(320, viewportSize.height - STAGE_PADDING * 2);
  const stageScale = Math.min(
    availableWidth / FRAME_WIDTH,
    availableHeight / FRAME_HEIGHT,
    MAX_STAGE_SCALE,
  );

  return (
    <div
      style={{
        height: '100dvh',
        minHeight: '100dvh',
        overflow: 'hidden',
        padding: STAGE_PADDING,
        background: '#edf2f7',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: FRAME_WIDTH * stageScale,
            height: FRAME_HEIGHT * stageScale,
            flex: '0 0 auto',
          }}
        >
          <div
            style={{
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT,
              transform: `scale(${stageScale})`,
              transformOrigin: 'top left',
            }}
          >
            <div style={appShellStyle}>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'grid',
                  gap: shellGap,
                  gridTemplateColumns: '352px minmax(0, 1fr) 356px',
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
                <div
                  style={{
                    minHeight: 0,
                    display: 'grid',
                    gap: shellGap,
                    gridTemplateRows: '280px minmax(0, 1fr)',
                    overflow: 'hidden',
                  }}
                >
                  {toolboxCard}
                  {logCard}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
