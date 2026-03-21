import React, { useEffect, useRef, useState } from 'react';
import { Button, Empty, Space, Tag, Typography, Switch, Tooltip, message } from 'antd';
import { BugOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import { useSimStore } from '../store';

const { Text } = Typography;

const LEVEL_META: Record<string, { color: string; background: string; label: string }> = {
  info: { color: '#475569', background: '#f8fafc', label: '信息' },
  success: { color: '#15803d', background: '#f0fdf4', label: '成功' },
  error: { color: '#dc2626', background: '#fef2f2', label: '错误' },
  warn: { color: '#b45309', background: '#fffbeb', label: '告警' },
};

export default function LogPanel() {
  const { logs, clearLogs, selectedDeviceId } = useSimStore();
  const [filterDevice, setFilterDevice] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(
    () => (filterDevice && selectedDeviceId
      ? logs.filter((item) => item.deviceId === selectedDeviceId || item.deviceId === 'system')
      : logs),
    [logs, filterDevice, selectedDeviceId],
  );

  const displayLogs = React.useMemo(() => filtered.slice().reverse(), [filtered]);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [displayLogs.length, autoScroll]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(226,232,240,0.9)',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <Space size={8} wrap>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#eff6ff',
                color: '#2563eb',
              }}
            >
              <BugOutlined />
            </div>
            <Space direction="vertical" size={0}>
              <Text strong style={{ color: '#0f172a' }}>运行日志</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {filterDevice && selectedDeviceId ? '仅展示当前设备和系统日志' : '展示全部设备与系统日志'}
              </Text>
            </Space>
            <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 10 }}>{filtered.length}</Tag>
          </Space>

          <Space size={8} wrap>
            <Switch
              size="small"
              checked={autoScroll}
              onChange={setAutoScroll}
              checkedChildren="跟随"
              unCheckedChildren="手动"
            />
            <Switch
              size="small"
              checked={filterDevice}
              onChange={setFilterDevice}
              checkedChildren="当前"
              unCheckedChildren="全部"
            />
            <Tooltip title="导出日志">
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                onClick={async () => {
                  if (filtered.length === 0) {
                    message.info('没有可导出的日志');
                    return;
                  }
                  const text = displayLogs
                    .map((item) => `${item.time} [${item.level.toUpperCase()}] [${item.deviceName}] ${item.message}`)
                    .join('\n');
                  await window.electronAPI.fileExport(text, `sim-logs-${Date.now()}.txt`);
                }}
                disabled={filtered.length === 0}
              />
            </Tooltip>
            <Tooltip title="清空日志">
              <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearLogs} />
            </Tooltip>
          </Space>
        </div>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 12,
          background: '#f8fafc',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有日志" />
          </div>
        ) : (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {displayLogs.map((log) => {
              const meta = LEVEL_META[log.level] || LEVEL_META.info;
              return (
                <div
                  key={log.id}
                  style={{
                    padding: '12px 12px 10px',
                    borderRadius: 18,
                    border: '1px solid rgba(226,232,240,0.9)',
                    background: '#ffffff',
                    boxShadow: '0 8px 20px rgba(15,23,42,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Space size={6} wrap>
                      <Tag
                        style={{
                          margin: 0,
                          borderRadius: 999,
                          color: meta.color,
                          borderColor: 'transparent',
                          background: meta.background,
                        }}
                      >
                        {meta.label}
                      </Tag>
                      <Tag style={{ margin: 0, borderRadius: 999, background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}>
                        {log.deviceName}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {log.time}
                    </Text>
                  </div>

                  <Text
                    style={{
                      display: 'block',
                      marginTop: 8,
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.7,
                      fontSize: 12,
                    }}
                  >
                    {log.message}
                  </Text>
                </div>
              );
            })}
          </Space>
        )}
      </div>
    </div>
  );
}
