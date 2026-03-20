import React, { useEffect, useRef, useState } from 'react';
import { Button, Space, Tag, Typography, Switch, Tooltip, message } from 'antd';
import { BugOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import { useSimStore } from '../store';

const { Text } = Typography;

const levelColor: Record<string, string> = {
  info: '#8c8c8c', success: '#52c41a', error: '#ff4d4f', warn: '#faad14',
};

export default function LogPanel() {
  const { logs, clearLogs, selectedDeviceId } = useSimStore();
  const [filterDevice, setFilterDevice] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() =>
    filterDevice && selectedDeviceId
      ? logs.filter((l) => l.deviceId === selectedDeviceId || l.deviceId === 'system')
      : logs,
    [logs, filterDevice, selectedDeviceId],
  );

  const displayLogs = React.useMemo(() => filtered.slice().reverse(), [filtered]);

  // Logs are stored newest-first, but the panel displays them oldest-first so the latest entry stays at the bottom.
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [displayLogs.length, autoScroll]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Space>
          <BugOutlined style={{ color: '#8c8c8c' }} />
          <Text style={{ fontSize: 13, fontWeight: 500 }}>日志</Text>
          <Tag>{filtered.length}</Tag>
        </Space>
        <Space size={8}>
          <Switch size="small" checked={autoScroll} onChange={setAutoScroll} checkedChildren="自动滚动" unCheckedChildren="手动" />
          <Switch size="small" checked={filterDevice} onChange={setFilterDevice} checkedChildren="当前设备" unCheckedChildren="全部" />
          <Tooltip title="导出日志">
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={async () => {
              if (filtered.length === 0) { message.info('无日志可导出'); return; }
              const text = displayLogs.map((l) => `${l.time} [${l.level.toUpperCase()}] [${l.deviceName}] ${l.message}`).join('\n');
              await window.electronAPI.fileExport(text, `sim-logs-${Date.now()}.txt`);
            }} disabled={filtered.length === 0} />
          </Tooltip>
          <Tooltip title="清空日志">
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearLogs} />
          </Tooltip>
        </Space>
      </div>
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '4px 16px', fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.8 }}>
        {filtered.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无日志...</Text>}
        {displayLogs.map((log) => (
          <div
            key={log.id}
            style={{
              padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Text style={{ color: '#595959' }}>{log.time}</Text>
              <Text style={{ color: levelColor[log.level] || '#8c8c8c' }}>[{log.level.toUpperCase()}]</Text>
              <Text style={{ color: '#4f46e5' }}>[{log.deviceName}]</Text>
            </div>
            <Text
              style={{
                display: 'block',
                marginTop: 2,
                color: 'rgba(255,255,255,0.88)',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {log.message}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
