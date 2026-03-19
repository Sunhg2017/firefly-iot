import React, { useRef, useState } from 'react';
import {
  Button,
  Divider,
  Empty,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined, WifiOutlined } from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface MqttMsg {
  dir: 'pub' | 'sub';
  topic: string;
  payload: string;
  qos: number;
  ts: number;
}

interface Props {
  device: SimDevice;
  mqttQos: 0 | 1 | 2;
  setMqttQos: React.Dispatch<React.SetStateAction<0 | 1 | 2>>;
  mqttRetain: boolean;
  setMqttRetain: React.Dispatch<React.SetStateAction<boolean>>;
  mqttSubs: Array<{ topic: string; qos: number }>;
  setMqttSubs: React.Dispatch<React.SetStateAction<Array<{ topic: string; qos: number }>>>;
  mqttMessages: MqttMsg[];
  setMqttMessages: React.Dispatch<React.SetStateAction<MqttMsg[]>>;
}

export type { MqttMsg };

export default function MqttControlPanel({
  device,
  mqttQos,
  setMqttQos,
  mqttRetain,
  setMqttRetain,
  mqttSubs,
  setMqttSubs,
  mqttMessages,
  setMqttMessages,
}: Props) {
  const { addLog } = useSimStore();
  const [mqttSubTopic, setMqttSubTopic] = useState('');
  const [mqttSubQos, setMqttSubQos] = useState<0 | 1 | 2>(1);
  const [mqttLogOpen, setMqttLogOpen] = useState(false);
  const [mqttLogFilter, setMqttLogFilter] = useState('');
  const [mqttLogDir, setMqttLogDir] = useState<'all' | 'pub' | 'sub'>('all');
  const mqttLogRef = useRef<HTMLDivElement>(null);

  const isOnline = device.status === 'online';
  if (device.protocol !== 'MQTT' || !isOnline) return null;

  return (
    <>
      <Modal
        title="MQTT 消息日志"
        open={mqttLogOpen}
        width={720}
        footer={null}
        onCancel={() => setMqttLogOpen(false)}
        afterOpenChange={(open) => {
          if (open) {
            setTimeout(() => {
              mqttLogRef.current?.scrollTo({ top: mqttLogRef.current.scrollHeight });
            }, 100);
          }
        }}
      >
        <Space style={{ width: '100%', marginBottom: 8 }} wrap>
          <Input
            size="small"
            placeholder="搜索关键字"
            value={mqttLogFilter}
            onChange={(event) => setMqttLogFilter(event.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Radio.Group size="small" value={mqttLogDir} onChange={(event) => setMqttLogDir(event.target.value)}>
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="pub">发布</Radio.Button>
            <Radio.Button value="sub">接收</Radio.Button>
          </Radio.Group>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={async () => {
              const filtered = mqttMessages.filter(
                (item) =>
                  (mqttLogDir === 'all' || item.dir === mqttLogDir) &&
                  (!mqttLogFilter || item.topic.includes(mqttLogFilter) || item.payload.includes(mqttLogFilter)),
              );
              const text = filtered
                .map(
                  (item) =>
                    `[${new Date(item.ts).toISOString()}] [${item.dir.toUpperCase()}] [QoS ${item.qos}] ${item.topic}\n${item.payload}`,
                )
                .join('\n\n');
              await window.electronAPI.fileExport(text, `mqtt-messages-${Date.now()}.txt`);
            }}
          >
            导出
          </Button>
          <Button
            size="small"
            onClick={() => {
              const text = mqttMessages
                .map(
                  (item) =>
                    `[${new Date(item.ts).toISOString()}] [${item.dir.toUpperCase()}] [QoS ${item.qos}] ${item.topic}\n${item.payload}`,
                )
                .join('\n\n');
              navigator.clipboard.writeText(text);
              message.success('已复制全部消息');
            }}
          >
            复制全部
          </Button>
          <Button
            size="small"
            danger
            onClick={() => {
              setMqttMessages([]);
              message.success('已清空');
            }}
          >
            清空
          </Button>
        </Space>
        <div ref={mqttLogRef} style={{ height: 420, overflow: 'auto', background: '#0d1117', borderRadius: 6, padding: 8 }}>
          {(() => {
            const filtered = mqttMessages.filter(
              (item) =>
                (mqttLogDir === 'all' || item.dir === mqttLogDir) &&
                (!mqttLogFilter || item.topic.includes(mqttLogFilter) || item.payload.includes(mqttLogFilter)),
            );
            if (filtered.length === 0) return <Empty description="暂无消息" />;

            const highlightText = (text: string) => {
              if (!mqttLogFilter) return text;
              const parts = text.split(new RegExp(`(${mqttLogFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
              return parts.map((part, index) =>
                part.toLowerCase() === mqttLogFilter.toLowerCase() ? (
                  <mark key={index} style={{ background: '#e6a700', color: '#000', borderRadius: 2 }}>
                    {part}
                  </mark>
                ) : (
                  part
                ),
              );
            };

            return filtered.map((item, index) => (
              <div
                key={index}
                style={{
                  marginBottom: 8,
                  padding: 6,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4,
                  borderLeft: `3px solid ${item.dir === 'pub' ? '#91caff' : '#b7eb8f'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <Space size={6}>
                    <Tag color={item.dir === 'pub' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                      {item.dir === 'pub' ? '发布' : '接收'}
                    </Tag>
                    <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{highlightText(item.topic)}</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      QoS {item.qos}
                    </Text>
                  </Space>
                  <Space size={4}>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {new Date(item.ts).toLocaleTimeString()}
                    </Text>
                    <Button
                      size="small"
                      type="link"
                      style={{ fontSize: 10, padding: 0 }}
                      onClick={() => {
                        navigator.clipboard.writeText(item.payload);
                        message.success('已复制消息');
                      }}
                    >
                      复制
                    </Button>
                  </Space>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#d4d4d4',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  {highlightText(item.payload)}
                </pre>
              </div>
            ));
          })()}
        </div>
      </Modal>

      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <WifiOutlined />
            <Text strong>MQTT 控制面板</Text>
          </Space>
          <Button type="link" size="small" style={{ fontSize: 11, padding: 0 }} onClick={() => setMqttLogOpen(true)}>
            消息日志 ({mqttMessages.length})
          </Button>
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>发布 QoS:</Text>
            <Radio.Group value={mqttQos} onChange={(event) => setMqttQos(event.target.value)} size="small">
              <Radio.Button value={0}>0</Radio.Button>
              <Radio.Button value={1}>1</Radio.Button>
              <Radio.Button value={2}>2</Radio.Button>
            </Radio.Group>
            <Switch size="small" checked={mqttRetain} onChange={setMqttRetain} checkedChildren="保留" unCheckedChildren="保留" />
          </div>

          <Divider style={{ margin: '4px 0', fontSize: 11 }} orientation="left">
            主题订阅管理
          </Divider>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input
              size="small"
              placeholder="订阅主题，如 /sys/+/+/thing/#"
              value={mqttSubTopic}
              onChange={(event) => setMqttSubTopic(event.target.value)}
              style={{ flex: 1 }}
            />
            <Select
              size="small"
              value={mqttSubQos}
              onChange={(value) => setMqttSubQos(value)}
              style={{ width: 80 }}
              options={[
                { value: 0, label: 'QoS 0' },
                { value: 1, label: 'QoS 1' },
                { value: 2, label: 'QoS 2' },
              ]}
            />
            <Button
              size="small"
              type="primary"
              disabled={!mqttSubTopic.trim()}
              onClick={async () => {
                const topic = mqttSubTopic.trim();
                const result = await window.electronAPI.mqttSubscribe(device.id, topic, mqttSubQos);
                if (result.success) {
                  setMqttSubs((prev) => (prev.some((item) => item.topic === topic) ? prev : [...prev, { topic, qos: mqttSubQos }]));
                  addLog(device.id, device.name, 'success', `已订阅：${topic} (QoS ${mqttSubQos})`);
                  setMqttSubTopic('');
                } else {
                  message.error(`订阅失败：${result.message}`);
                }
              }}
            >
              订阅
            </Button>
          </div>
          {mqttSubs.length > 0 && (
            <div style={{ fontSize: 11 }}>
              {mqttSubs.map((sub) => (
                <Tag
                  key={sub.topic}
                  closable
                  onClose={async () => {
                    const result = await window.electronAPI.mqttUnsubscribe(device.id, sub.topic);
                    if (result.success) {
                      setMqttSubs((prev) => prev.filter((item) => item.topic !== sub.topic));
                      addLog(device.id, device.name, 'info', `已取消订阅：${sub.topic}`);
                    }
                  }}
                  style={{ margin: '2px 2px', fontSize: 11 }}
                >
                  {sub.topic}{' '}
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    (QoS {sub.qos})
                  </Text>
                </Tag>
              ))}
            </div>
          )}

          {mqttMessages.length > 0 &&
            (() => {
              const pubCount = mqttMessages.filter((item) => item.dir === 'pub').length;
              const subCount = mqttMessages.filter((item) => item.dir === 'sub').length;
              return (
                <div style={{ display: 'flex', gap: 16, fontSize: 11, padding: '4px 0' }}>
                  <Text type="secondary">
                    消息总计: <Text strong>{mqttMessages.length}</Text>
                  </Text>
                  <Text type="secondary">
                    发布: <Text strong style={{ color: '#91caff' }}>{pubCount}</Text>
                  </Text>
                  <Text type="secondary">
                    接收: <Text strong style={{ color: '#b7eb8f' }}>{subCount}</Text>
                  </Text>
                </div>
              );
            })()}
        </Space>
      </div>
    </>
  );
}
