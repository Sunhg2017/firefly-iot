import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Drawer, Menu, Space, Tag, Typography } from 'antd';
import {
  AppstoreOutlined, BugOutlined, ExperimentOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useSimStore } from './store';
import { restorePersistedConnections } from './utils/runtime';
import {
  DeviceListPanel,
  DeviceControlPanel,
  LogPanel,
  StressCenterPanel,
  ToolsPanel,
  SimulatorAccessGate,
} from './components';
import { getActiveEnvironment, useSimWorkspaceStore } from './workspaceStore';

const { Text } = Typography;

type SimPage = 'devices' | 'stress' | 'logs' | 'tools';

const PAGE_STORAGE_KEY = 'firefly-simulator:page';

const PAGE_META: Record<SimPage, { label: string; icon: React.ReactNode }> = {
  devices: { label: '设备管理', icon: <AppstoreOutlined /> },
  stress: { label: '压测中心', icon: <ExperimentOutlined /> },
  logs: { label: '运行日志', icon: <BugOutlined /> },
  tools: { label: '工具', icon: <ToolOutlined /> },
};

function readInitialPage(): SimPage {
  const saved = localStorage.getItem(PAGE_STORAGE_KEY);
  return saved === 'stress' || saved === 'logs' || saved === 'tools' ? saved : 'devices';
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
  const devices = useSimStore((state) => state.devices);
  const selectedDeviceId = useSimStore((state) => state.selectedDeviceId);
  const selectDevice = useSimStore((state) => state.selectDevice);
  const [page, setPage] = useState<SimPage>(readInitialPage);
  const [detailDeviceId, setDetailDeviceId] = useState<string | null>(null);
  const [stressSeedIds, setStressSeedIds] = useState<string[] | undefined>();
  const onlineCount = devices.filter((device) => device.status === 'online').length;

  useEffect(() => {
    localStorage.setItem(PAGE_STORAGE_KEY, page);
  }, [page]);

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
    return useSimStore.persist.onFinishHydration(() => restore());
  }, [activeSession?.accessToken]);

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
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ deviceIds?: string[] }>).detail;
      setStressSeedIds(detail?.deviceIds);
      setPage('stress');
    };
    window.addEventListener('sim:open-stress', handler);
    return () => window.removeEventListener('sim:open-stress', handler);
  }, []);

  useEffect(() => {
    if (!detailDeviceId) {
      return;
    }
    if (!devices.some((device) => device.id === detailDeviceId)) {
      setDetailDeviceId(null);
    }
  }, [detailDeviceId, devices]);

  if (!activeSession?.accessToken) {
    return <SimulatorAccessGate />;
  }

  const openDevice = (deviceId: string) => {
    selectDevice(deviceId);
    setDetailDeviceId(deviceId);
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f3f7fb' }}>
      <div
        style={{
          height: 64,
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '0 20px',
          background: '#ffffff',
          borderBottom: '1px solid #dbe4ee',
          boxShadow: '0 6px 18px rgba(15,23,42,0.04)',
          zIndex: 10,
        }}
      >
        <Space size={10} style={{ flex: '0 0 auto' }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#2563eb', fontWeight: 800,
              background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe',
            }}
          >
            FS
          </div>
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 15 }}>Firefly Simulator</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>设备模拟与批量压测</Text>
          </Space>
        </Space>

        <Menu
          mode="horizontal"
          selectedKeys={[page]}
          onClick={({ key }) => setPage(key as SimPage)}
          items={Object.entries(PAGE_META).map(([key, meta]) => ({ key, icon: meta.icon, label: meta.label }))}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
        />

        <Space size={12} wrap>
          <Badge status={onlineCount > 0 ? 'success' : 'default'} text={`在线 ${onlineCount}/${devices.length}`} />
          <Tag color="blue" style={{ margin: 0 }}>{activeEnvironment.name}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activeSession.user?.realName || activeSession.user?.username || '当前用户'}
          </Text>
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        {page === 'devices' ? (
          <div style={{ height: '100%', background: '#ffffff', borderRadius: 18, border: '1px solid #dbe4ee', overflow: 'hidden' }}>
            <DeviceListPanel onOpenDevice={openDevice} />
          </div>
        ) : null}
        {page === 'stress' ? <StressCenterPanel seedDeviceIds={stressSeedIds} /> : null}
        {page === 'logs' ? (
          <div style={{ height: '100%', background: '#ffffff', borderRadius: 18, border: '1px solid #dbe4ee', overflow: 'hidden' }}>
            <LogPanel />
          </div>
        ) : null}
        {page === 'tools' ? <ToolsPanel /> : null}
      </div>

      <Drawer
        title={selectedDeviceId ? `设备详情 · ${devices.find((device) => device.id === selectedDeviceId)?.name || ''}` : '设备详情'}
        open={Boolean(detailDeviceId)}
        onClose={() => setDetailDeviceId(null)}
        width="min(1280px, 96vw)"
        destroyOnHidden
        styles={{ body: { padding: 0, background: '#f8fbff' } }}
      >
        {detailDeviceId ? <DeviceControlPanel /> : null}
      </Drawer>
    </div>
  );
}
