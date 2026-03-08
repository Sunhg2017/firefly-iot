import { useEffect } from 'react';
import { Layout } from 'antd';
import { useSimStore } from './store';
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
    <Layout style={{ height: '100vh', background: '#141414' }}>
      {/* Left: Device List */}
      <Sider width={280} style={{ background: '#1a1a2e', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
        <DeviceListPanel />
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center' }}>
          <StressTestPanel />
          <ScenarioPanel />
          <TemplateEditorPanel />
        </div>
      </Sider>

      {/* Right: Control + Logs */}
      <Layout>
        <Content style={{ background: '#141414', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Top: Device Control */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <DeviceControlPanel />
          </div>
          {/* Bottom: Logs */}
          <div style={{ height: 240, borderTop: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
            <LogPanel />
          </div>
        </Content>
      </Layout>
      {/* Global Status Bar */}
      <StatusBar />
    </Layout>
  );
}
