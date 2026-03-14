import { useEffect } from 'react';
import { Layout } from 'antd';
import { useSimStore } from './store';
import { restorePersistedConnections } from './utils/runtime';
import {
  DeviceListPanel, DeviceControlPanel, LogPanel,
  StressTestPanel, ScenarioPanel, TemplateEditorPanel, StatusBar,
} from './components';

const { Sider, Content } = Layout;

// ============================================================
// App Layout
// ============================================================

export default function App() {
  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N: add device
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('sim:add-device'));
      }
      // Ctrl+Shift+C: batch connect
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('sim:batch-connect'));
      }
      // Ctrl+Shift+D: batch disconnect
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
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

  // Listen for MQTT events from main process
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubMsg = window.electronAPI.onMqttMessage((id: string, topic: string, payload: string) => {
      const { addLog, devices } = useSimStore.getState();
      const dev = devices.find((d) => d.id === id);
      addLog(id, dev?.name || id, 'info', `[收到] ${topic}: ${payload.slice(0, 200)}`);
    });

    const unsubDisconnect = window.electronAPI.onMqttDisconnected((id: string) => {
      const { addLog, updateDevice, devices } = useSimStore.getState();
      const dev = devices.find((d) => d.id === id);
      updateDevice(id, { status: 'offline' });
      addLog(id, dev?.name || id, 'warn', 'MQTT 连接已断开');
    });

    const unsubError = window.electronAPI.onMqttError((id: string, error: string) => {
      const { addLog, devices } = useSimStore.getState();
      const dev = devices.find((d) => d.id === id);
      addLog(id, dev?.name || id, 'error', `MQTT 错误: ${error}`);
    });

    return () => {
      unsubMsg();
      unsubDisconnect();
      unsubError();
    };
  }, []);

  return (
    <Layout
      style={{
        height: '100vh',
        padding: 16,
        background:
          'radial-gradient(circle at top left, rgba(251,191,36,0.14), transparent 24%), radial-gradient(circle at top right, rgba(59,130,246,0.16), transparent 28%), linear-gradient(180deg, #08111f 0%, #101826 52%, #0b1220 100%)',
      }}
    >
      <Layout style={{ flex: 1, background: 'transparent', minHeight: 0 }}>
        {/* Left: Device List */}
        <Sider
          width={344}
          breakpoint="lg"
          collapsedWidth={284}
          style={{
            background: 'rgba(9, 14, 24, 0.72)',
            border: '1px solid rgba(148, 163, 184, 0.16)',
            borderRadius: 24,
            backdropFilter: 'blur(18px)',
            boxShadow: '0 18px 60px rgba(0, 0, 0, 0.30)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 284,
          }}
        >
          <DeviceListPanel />
          <div
            style={{
              padding: '14px 16px 16px',
              borderTop: '1px solid rgba(148,163,184,0.12)',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(8,15,29,0.94) 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <StressTestPanel />
            <ScenarioPanel />
            <TemplateEditorPanel />
          </div>
        </Sider>

        {/* Right: Control + Logs */}
        <Layout style={{ background: 'transparent', marginLeft: 16, minWidth: 0 }}>
          <Content
            style={{
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 28,
              background: 'rgba(9, 14, 24, 0.68)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 18px 60px rgba(0, 0, 0, 0.25)',
              minWidth: 0,
            }}
          >
            {/* Top: Device Control */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <DeviceControlPanel />
            </div>
            {/* Bottom: Logs */}
            <div
              style={{
                height: 260,
                borderTop: '1px solid rgba(148,163,184,0.12)',
                background: 'linear-gradient(180deg, rgba(8,15,29,0.82) 0%, rgba(4,8,17,0.94) 100%)',
                minHeight: 180,
              }}
            >
              <LogPanel />
            </div>
          </Content>
        </Layout>
      </Layout>
      {/* Global Status Bar */}
      <StatusBar />
    </Layout>
  );
}
