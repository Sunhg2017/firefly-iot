import { useEffect, useState } from 'react';
import { Card, Space, Input, Button, Tag, Table, Empty, Typography } from 'antd';
import { SendOutlined, ClearOutlined, WifiOutlined } from '@ant-design/icons';
import type { SimDevice } from '../../store';
import { useSimStore } from '../../store';

const { Text } = Typography;

export interface WsMsg {
  dir: 'tx' | 'rx';
  payload: string;
  ts: number;
}

interface Props {
  device: SimDevice;
  wsMessages: WsMsg[];
  setWsMessages: React.Dispatch<React.SetStateAction<WsMsg[]>>;
}

export default function WebSocketControlPanel({ device, wsMessages, setWsMessages }: Props) {
  const { addLog } = useSimStore();
  const [sendPayload, setSendPayload] = useState('{"temperature": 25.5, "humidity": 60}');
  const [sending, setSending] = useState(false);

  if (device.protocol !== 'WebSocket') return null;
  const isOnline = device.status === 'online';

  const handleSend = async () => {
    if (!sendPayload.trim()) return;
    setSending(true);
    try {
      const res = await window.electronAPI.wsSend(device.id, sendPayload.trim());
      if (res.success) {
        setWsMessages((prev) => [...prev.slice(-199), { dir: 'tx', payload: sendPayload.trim(), ts: Date.now() }]);
        addLog(device.id, device.name, 'success', `WS 发送: ${sendPayload.trim().slice(0, 100)}`);
      } else {
        addLog(device.id, device.name, 'error', `WS 发送失败: ${res.message}`);
      }
    } catch (err: any) {
      addLog(device.id, device.name, 'error', `WS 发送异常: ${err?.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={<Space><WifiOutlined /> WebSocket 消息</Space>} size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">发送 JSON:</Text>
          <Input.TextArea
            rows={3}
            value={sendPayload}
            onChange={(e) => setSendPayload(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
            placeholder='{"temperature": 25.5, "humidity": 60}'
          />
        </div>
        <Space>
          <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleSend}
            loading={sending} disabled={!isOnline}>
            发送
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={() => setWsMessages([])}>
            清空
          </Button>
          <Text style={{ fontSize: 11 }} type="secondary">
            收: {wsMessages.filter(m => m.dir === 'rx').length} / 发: {wsMessages.filter(m => m.dir === 'tx').length}
          </Text>
        </Space>
        {wsMessages.length > 0 ? (
          <Table size="small" pagination={{ pageSize: 10, size: 'small' }}
            dataSource={[...wsMessages].reverse().map((m, i) => ({ key: i, ...m }))}
            columns={[
              { title: '方向', dataIndex: 'dir', width: 60,
                render: (v: string) => v === 'tx'
                  ? <Tag color="blue">发送</Tag>
                  : <Tag color="green">接收</Tag> },
              { title: '内容', dataIndex: 'payload', ellipsis: true,
                render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
              { title: '时间', dataIndex: 'ts', width: 90,
                render: (v: number) => <Text style={{ fontSize: 11 }} type="secondary">{new Date(v).toLocaleTimeString('zh-CN', { hour12: false })}</Text> },
            ]}
          />
        ) : (
          <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
        )}
      </Space>
    </Card>
  );
}
