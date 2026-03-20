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
        addLog(device.id, device.name, 'success', `LoRaWAN 涓婅: ${sendPayload.trim().slice(0, 100)}`);
      } else {
        addLog(device.id, device.name, 'error', `LoRaWAN 鍙戦€佸け璐? ${res.message}`);
      }
    } catch (err: any) {
      addLog(device.id, device.name, 'error', `LoRaWAN 鍙戦€佸紓甯? ${err?.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={<Space><WifiOutlined /> LoRaWAN 涓婅妯℃嫙</Space>} size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
          DevEUI: <code>{device.loraDevEui}</code> | fPort: {device.loraFPort} | 搴旂敤: {device.loraAppId || '-'}
        </div>
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">涓婅杞借嵎 (JSON):</Text>
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
            妯℃嫙涓婅
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={() => setLoraMessages([])}>
            娓呯┖
          </Button>
          <Text style={{ fontSize: 11 }} type="secondary">
            宸插彂閫? {loraMessages.filter(m => m.dir === 'tx').length}
          </Text>
        </Space>
        {loraMessages.length > 0 ? (
          <Table size="small" pagination={{ pageSize: 10, size: 'small' }} scroll={{ x: 720 }}
            dataSource={[...loraMessages].reverse().map((m, i) => ({ key: i, ...m }))}
            columns={[
              { title: '鏂瑰悜', dataIndex: 'dir', width: 60,
                render: (v: string) => v === 'tx'
                  ? <Tag color="blue">涓婅</Tag>
                  : <Tag color="green">涓嬭</Tag> },
              { title: '鍐呭', dataIndex: 'payload',
                render: (v: string) => (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {v}
                  </div>
                ) },
              { title: '鏃堕棿', dataIndex: 'ts', width: 90,
                render: (v: number) => <Text style={{ fontSize: 11 }} type="secondary">{new Date(v).toLocaleTimeString('zh-CN', { hour12: false })}</Text> },
            ]}
          />
        ) : (
          <Empty description="鏆傛棤娑堟伅" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
        )}
      </Space>
    </Card>
  );
}