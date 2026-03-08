import React, { useEffect, useState } from 'react';
import {
  Card, Button, Space, message, Table, Tag, Tabs, Statistic, Row, Col,
  Input, Empty, Tooltip, InputNumber, Descriptions,
} from 'antd';
import {
  ReloadOutlined, SendOutlined, WifiOutlined,
  ClockCircleOutlined, CloudServerOutlined, SettingOutlined,
  SignalFilled,
} from '@ant-design/icons';
import { loraWanApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { formatDateTime } from '../../utils/datetime';

interface LoRaDevice {
  devEui: string;
  deviceName: string;
  applicationId: string;
  applicationName: string;
  lastUplinkTime: number;
  lastDownlinkTime: number;
  lastRssi: number;
  lastSnr: number;
  lastGatewayId: string;
  lastFCnt: number;
  uplinkCount: { value: number };
  downlinkCount: { value: number };
  firstSeenTime: number;
  joined: boolean;
}

interface LoRaStats {
  enabled: boolean;
  networkServer: string;
  deviceCount: number;
  totalUplinks: number;
  totalDownlinks: number;
  payloadCodec: string;
}

interface LoRaConfig {
  enabled: boolean;
  networkServer: string;
  apiUrl: string;
  webhookPath: string;
  payloadCodec: string;
  applicationId: string;
  downlinkClass: string;
  downlinkFPort: number;
  downlinkConfirmed: boolean;
  deduplicationWindowMs: number;
}

const LoRaWanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('devices');

  const [devices, setDevices] = useState<LoRaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LoRaStats | null>(null);
  const [config, setConfig] = useState<LoRaConfig | null>(null);

  // Downlink state
  const [dlDevEui, setDlDevEui] = useState('');
  const [dlFPort, setDlFPort] = useState(1);
  const [dlData, setDlData] = useState('');
  const [dlLoading, setDlLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [devRes, statsRes, cfgRes] = await Promise.all([
        loraWanApi.listDevices(),
        loraWanApi.stats(),
        loraWanApi.config(),
      ]);
      setDevices(devRes.data.data || []);
      setStats(statsRes.data.data || null);
      setConfig(cfgRes.data.data || null);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleDownlink = async () => {
    if (!dlDevEui.trim() || !dlData.trim()) {
      message.warning('请输入 DevEUI 和下行数据');
      return;
    }
    setDlLoading(true);
    try {
      const res = await loraWanApi.sendDownlink({ devEui: dlDevEui.trim(), fPort: dlFPort, data: dlData.trim() });
      if (res.data.data) {
        message.success('下行消息已排队');
      } else {
        message.warning('发送失败');
      }
    } catch {
      message.error('发送失败');
    } finally {
      setDlLoading(false);
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '-';
    return formatDateTime(ts);
  };

  const formatDuration = (ts: number) => {
    if (!ts) return '-';
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const columns: ColumnsType<LoRaDevice> = [
    { title: 'DevEUI', dataIndex: 'devEui', width: 160,
      render: (v: string) => <Tooltip title={v}><code style={{ fontSize: 11 }}>{v}</code></Tooltip> },
    { title: '设备名称', dataIndex: 'deviceName', width: 140, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '应用', dataIndex: 'applicationName', width: 120, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'joined', width: 70,
      render: (v: boolean) => v ? <Tag color="success">已入网</Tag> : <Tag>未入网</Tag> },
    { title: '上行', width: 70,
      render: (_: unknown, r: LoRaDevice) => <Tag color="processing">{r.uplinkCount?.value || 0}</Tag> },
    { title: '下行', width: 70,
      render: (_: unknown, r: LoRaDevice) => <Tag color="blue">{r.downlinkCount?.value || 0}</Tag> },
    { title: 'RSSI/SNR', width: 110,
      render: (_: unknown, r: LoRaDevice) => (
        <Space size={4}>
          <Tooltip title="RSSI"><Tag color={r.lastRssi > -100 ? 'green' : r.lastRssi > -120 ? 'orange' : 'red'}>{r.lastRssi} dBm</Tag></Tooltip>
          <Tooltip title="SNR"><Tag>{r.lastSnr?.toFixed(1)} dB</Tag></Tooltip>
        </Space>
      ),
    },
    { title: '最后上行', dataIndex: 'lastUplinkTime', width: 110,
      render: (v: number) => v ? <Tooltip title={formatTime(v)}><Space size={4}><ClockCircleOutlined />{formatDuration(v)} 前</Space></Tooltip> : '-' },
    { title: 'fCnt', dataIndex: 'lastFCnt', width: 70,
      render: (v: number) => <code style={{ fontSize: 11 }}>{v}</code> },
    {
      title: '操作', width: 80,
      render: (_: unknown, r: LoRaDevice) => (
        <Button type="link" size="small" icon={<SendOutlined />}
          onClick={() => { setDlDevEui(r.devEui); setActiveTab('downlink'); }}>
          下行
        </Button>
      ),
    },
  ];

  const cardStyle = { borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };

  return (
    <div>
      <PageHeader title="LoRaWAN 设备接入" description="LoRaWAN 网络服务器集成、设备管理、上下行数据、Webhook 回调" />

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'devices', label: 'LoRa 设备',
          children: (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card style={cardStyle}>
                    <Statistic title="已知设备" value={stats?.deviceCount || 0} prefix={<WifiOutlined />}
                      valueStyle={{ color: (stats?.deviceCount || 0) > 0 ? '#52c41a' : undefined }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={cardStyle}>
                    <Statistic title="总上行帧" value={stats?.totalUplinks || 0} prefix={<SignalFilled />}
                      valueStyle={{ color: '#1677ff' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={cardStyle}>
                    <Statistic title="总下行帧" value={stats?.totalDownlinks || 0} prefix={<SendOutlined />} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={cardStyle}>
                    <Statistic title="网络服务器" value={stats?.networkServer || '-'}
                      valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} prefix={<CloudServerOutlined />} />
                  </Card>
                </Col>
              </Row>
              <Card style={cardStyle}
                extra={<Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>刷新</Button>}>
                {devices.length === 0 && !loading ? (
                  <Empty description="暂无 LoRaWAN 设备 (等待 Webhook 上报)" />
                ) : (
                  <Table rowKey="devEui" columns={columns} dataSource={devices} loading={loading}
                    size="small" pagination={{ pageSize: 20, showSizeChanger: true }} />
                )}
              </Card>
            </div>
          ),
        },
        {
          key: 'downlink', label: '下行消息',
          children: (
            <Row gutter={16}>
              <Col span={12}>
                <Card title={<Space><SendOutlined /> 发送下行</Space>} style={cardStyle}>
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Input placeholder="DevEUI (e.g. 0102030405060708)" value={dlDevEui}
                      onChange={e => setDlDevEui(e.target.value)}
                      addonBefore="DevEUI" style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    <InputNumber min={1} max={255} value={dlFPort}
                      onChange={v => setDlFPort(v || 1)}
                      addonBefore="fPort" style={{ width: '100%' }} />
                    <Input.TextArea rows={5} placeholder='Base64 编码数据 或 JSON (e.g. {"led": true})'
                      value={dlData} onChange={e => setDlData(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    <Button type="primary" icon={<SendOutlined />} onClick={handleDownlink}
                      loading={dlLoading} disabled={!dlDevEui.trim() || !dlData.trim()}>
                      发送下行
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card title={<Space><WifiOutlined /> Webhook 说明</Space>} style={cardStyle}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      在 ChirpStack / TTN 控制台配置 HTTP Integration (Webhook)，将以下事件推送到对应 URL：
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
                      <div><Tag color="blue">上行</Tag> POST /api/v1/lorawan/webhook/up</div>
                      <div><Tag color="green">Join</Tag> POST /api/v1/lorawan/webhook/join</div>
                      <div><Tag>ACK</Tag> POST /api/v1/lorawan/webhook/ack</div>
                      <div><Tag>状态</Tag> POST /api/v1/lorawan/webhook/status</div>
                      <div><Tag color="red">错误</Tag> POST /api/v1/lorawan/webhook/error</div>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          ),
        },
        {
          key: 'config', label: '配置信息',
          children: config ? (
            <Card title={<Space><SettingOutlined /> LoRaWAN 配置</Space>} style={cardStyle}>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="启用状态"><Tag color={config.enabled ? 'success' : 'default'}>{config.enabled ? '已启用' : '已禁用'}</Tag></Descriptions.Item>
                <Descriptions.Item label="网络服务器"><Tag color="blue">{config.networkServer}</Tag></Descriptions.Item>
                <Descriptions.Item label="API 地址"><code style={{ fontSize: 11 }}>{config.apiUrl}</code></Descriptions.Item>
                <Descriptions.Item label="Webhook 路径"><code style={{ fontSize: 11 }}>{config.webhookPath}</code></Descriptions.Item>
                <Descriptions.Item label="载荷编码">{config.payloadCodec}</Descriptions.Item>
                <Descriptions.Item label="应用 ID">{config.applicationId || '-'}</Descriptions.Item>
                <Descriptions.Item label="下行类型">{config.downlinkClass}</Descriptions.Item>
                <Descriptions.Item label="默认 fPort">{config.downlinkFPort}</Descriptions.Item>
                <Descriptions.Item label="确认下行"><Tag color={config.downlinkConfirmed ? 'warning' : 'default'}>{config.downlinkConfirmed ? '是' : '否'}</Tag></Descriptions.Item>
                <Descriptions.Item label="去重窗口">{config.deduplicationWindowMs} ms</Descriptions.Item>
              </Descriptions>
            </Card>
          ) : (
            <Empty description="加载中..." />
          ),
        },
      ]} />
    </div>
  );
};

export default LoRaWanPage;
