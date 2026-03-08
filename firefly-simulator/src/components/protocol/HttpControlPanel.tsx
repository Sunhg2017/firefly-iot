import React, { useState } from 'react';
import {
  Button, Space, Tag, Typography, Empty,
  Modal, Tabs, message,
} from 'antd';
import { ApiOutlined, DownloadOutlined } from '@ant-design/icons';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface HttpHistoryEntry {
  method: string; url: string; reqBody: string; status: number;
  resBody: string; resHeaders: Record<string, string>; elapsed: number; ts: number;
}

interface Props {
  device: SimDevice;
  httpHistory: HttpHistoryEntry[];
  setHttpHistory: React.Dispatch<React.SetStateAction<HttpHistoryEntry[]>>;
}

export type { HttpHistoryEntry };

export default function HttpControlPanel({ device, httpHistory, setHttpHistory }: Props) {
  const [httpLogOpen, setHttpLogOpen] = useState(false);
  const isOnline = device.status === 'online';

  if (device.protocol !== 'HTTP' || !isOnline) return null;

  return (
    <>
      <Modal
        title="HTTP 请求历史"
        open={httpLogOpen}
        width={720}
        footer={null}
        onCancel={() => setHttpLogOpen(false)}
      >
        <Space style={{ width: '100%', marginBottom: 8 }}>
          <Button size="small" icon={<DownloadOutlined />} onClick={async () => {
            const text = httpHistory.map((h) => `[${new Date(h.ts).toISOString()}] ${h.method} ${h.url} → ${h.status} (${h.elapsed}ms)\nRequest:\n${h.reqBody}\nResponse:\n${h.resBody}\nHeaders: ${JSON.stringify(h.resHeaders)}`).join('\n\n---\n\n');
            await window.electronAPI.fileExport(text, `http-history-${Date.now()}.txt`);
          }}>导出</Button>
          <Button size="small" danger onClick={() => { setHttpHistory([]); message.success('已清空'); }}>清空</Button>
          <Text type="secondary" style={{ fontSize: 11 }}>共 {httpHistory.length} 条记录</Text>
        </Space>
        <div style={{ height: 450, overflow: 'auto', background: '#0d1117', borderRadius: 6, padding: 8 }}>
          {httpHistory.length === 0 ? <Empty description="暂无请求记录" /> : httpHistory.slice().reverse().map((h, i) => (
            <div key={i} style={{ marginBottom: 10, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4, borderLeft: `3px solid ${h.status < 400 ? '#52c41a' : '#ff4d4f'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Space size={6}>
                  <Tag color={h.status < 400 ? 'green' : 'red'} style={{ fontSize: 10 }}>{h.status}</Tag>
                  <Text strong style={{ fontSize: 11, fontFamily: 'monospace' }}>{h.method}</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#91caff' }}>{h.url}</Text>
                </Space>
                <Space size={6}>
                  <Tag style={{ fontSize: 10 }}>{h.elapsed}ms</Tag>
                  <Text type="secondary" style={{ fontSize: 10 }}>{new Date(h.ts).toLocaleTimeString()}</Text>
                </Space>
              </div>
              <Tabs size="small" items={[
                { key: 'req', label: <span style={{ fontSize: 10 }}>请求体</span>, children: <pre style={{ margin: 0, fontSize: 10, fontFamily: 'monospace', color: '#d4d4d4', maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{h.reqBody}</pre> },
                { key: 'res', label: <span style={{ fontSize: 10 }}>响应体</span>, children: <pre style={{ margin: 0, fontSize: 10, fontFamily: 'monospace', color: '#d4d4d4', maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{h.resBody}</pre> },
                { key: 'headers', label: <span style={{ fontSize: 10 }}>响应头</span>, children: <pre style={{ margin: 0, fontSize: 10, fontFamily: 'monospace', color: '#d4d4d4', maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{Object.entries(h.resHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre> },
              ]} style={{ marginBottom: 0 }} />
            </div>
          ))}
        </div>
      </Modal>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space><ApiOutlined /><Text strong>HTTP 控制面板</Text></Space>
          <Button type="link" size="small" style={{ fontSize: 11, padding: 0 }} onClick={() => setHttpLogOpen(true)}>请求历史 ({httpHistory.length})</Button>
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {httpHistory.length > 0 && (() => {
            const last = httpHistory[httpHistory.length - 1];
            const okCount = httpHistory.filter((h) => h.status >= 200 && h.status < 300).length;
            const errCount = httpHistory.filter((h) => h.status >= 400).length;
            const avgElapsed = Math.round(httpHistory.reduce((sum, h) => sum + h.elapsed, 0) / httpHistory.length);
            return (
              <>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, padding: '4px 0' }}>
                  <Text type="secondary">请求总计: <Text strong>{httpHistory.length}</Text></Text>
                  <Text type="secondary">成功: <Text strong style={{ color: '#52c41a' }}>{okCount}</Text></Text>
                  <Text type="secondary">失败: <Text strong style={{ color: '#ff4d4f' }}>{errCount}</Text></Text>
                  <Text type="secondary">平均延迟: <Text strong>{avgElapsed}ms</Text></Text>
                </div>
                <div style={{ fontSize: 11, padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 4, borderLeft: `3px solid ${last.status < 400 ? '#52c41a' : '#ff4d4f'}` }}>
                  <Text type="secondary">最近: </Text>
                  <Tag color={last.status < 400 ? 'green' : 'red'} style={{ fontSize: 10 }}>{last.status}</Tag>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{last.method} {last.url.replace(device.httpBaseUrl, '')}</Text>
                  <Text type="secondary" style={{ fontSize: 10, marginLeft: 8 }}>{last.elapsed}ms</Text>
                </div>
              </>
            );
          })()}
          {httpHistory.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>发送数据后将记录请求历史</Text>}
        </Space>
      </div>
    </>
  );
}
