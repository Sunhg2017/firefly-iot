import { useState } from 'react';
import { Card, Space, Input, Button, Tag, Table, Empty, Typography, InputNumber } from 'antd';
import { SendOutlined, ClearOutlined, WifiOutlined } from '@ant-design/icons';
import type { SimDevice } from '../../store';
import { useSimStore } from '../../store';

const { Text } = Typography;

export interface LoRaMsg {
  dir: 'tx' | 'rx';
  payload: string;
  ts: number;
}

interface Props {
  device: SimDevice;
  loraMessages: LoRaMsg[];
  setLoraMessages: React.Dispatch<React.SetStateAction<LoRaMsg[]>>;
}

export default function LoRaWanControlPanel({ device, loraMessages, setLoraMessages }: Props) {
  const { addLog } = useSimStore();
  const [sendPayload, setSendPayload] = useState('{"temperature": 25.5, "humidity": 60}');
  const [sending, setSending] = useState(false);

  if (device.protocol !== 'LoRaWAN') return null;

  const handleSend = async () => {
    if (!sendPayload.trim()) return;
    setSending(true);
    try {
      const res = await window.electronAPI.lorawanSend(
        device.loraWebhookUrl,
        device.loraDevEui,
        device.loraAppId,
        device.loraFPort,
        sendPayload.trim(),
      );
      if (res.success) {
        setLoraMessages((prev) => [...prev.slice(-199), { dir: 'tx', payload: sendPayload.trim(), ts: Date.now() }]);
        addLog(device.id, device.name, 'success', `LoRaWAN 上行: ${sendPayload.trim().slice(0, 100)}`);
      } else {
        addLog(device.id, device.name, 'error', `LoRaWAN 发送失败: ${res.message}`);
      }
    } catch (err: any) {
      addLog(device.id, device.name, 'error', `LoRaWAN 发送异常: ${err?.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={<Space><WifiOutlined /> LoRaWAN 上行模拟</Space>} size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
          DevEUI: <code>{device.loraDevEui}</code> | fPort: {device.loraFPort} | 应用: {device.loraAppId || '-'}
        </div>
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">上行载荷 (JSON):</Text>
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
            loading={sending}>
            模拟上行
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={() => setLoraMessages([])}>
            清空
          </Button>
          <Text style={{ fontSize: 11 }} type="secondary">
            已发送: {loraMessages.filter(m => m.dir === 'tx').length}
          </Text>
        </Space>
        {loraMessages.length > 0 ? (
          <Table size="small" pagination={{ pageSize: 10, size: 'small' }}
            dataSource={[...loraMessages].reverse().map((m, i) => ({ key: i, ...m }))}
            columns={[
              { title: '方向', dataIndex: 'dir', width: 60,
                render: (v: string) => v === 'tx'
                  ? <Tag color="blue">上行</Tag>
                  : <Tag color="green">下行</Tag> },
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
