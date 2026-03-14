import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CloudServerOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  SignalFilled,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import { loraWanApi } from '../../services/api';
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

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
};

const LoRaWanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('devices');
  const [devices, setDevices] = useState<LoRaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LoRaStats | null>(null);
  const [config, setConfig] = useState<LoRaConfig | null>(null);
  const [devEui, setDevEui] = useState('');
  const [fPort, setFPort] = useState(1);
  const [payload, setPayload] = useState('');
  const [sending, setSending] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [deviceRes, statsRes, configRes] = await Promise.all([
        loraWanApi.listDevices(),
        loraWanApi.stats(),
        loraWanApi.config(),
      ]);
      setDevices(deviceRes.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
      setConfig(configRes.data?.data ?? null);
    } catch {
      setDevices([]);
      setStats(null);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
    const timer = window.setInterval(() => {
      void fetchAll();
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const formatDuration = (timestamp: number) => {
    if (!timestamp) return '-';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handleDownlink = async () => {
    if (!devEui.trim() || !payload.trim()) {
      message.warning('请输入 DevEUI 和下行数据');
      return;
    }

    setSending(true);
    try {
      const res = await loraWanApi.sendDownlink({
        devEui: devEui.trim(),
        fPort,
        data: payload.trim(),
      });
      message[res.data?.data ? 'success' : 'warning'](res.data?.data ? '下行任务已提交' : '下行任务提交失败');
    } catch {
      message.error('发送下行失败');
    } finally {
      setSending(false);
    }
  };

  const columns: ColumnsType<LoRaDevice> = [
    {
      title: 'DevEUI',
      dataIndex: 'devEui',
      width: 180,
      render: (value: string) => (
        <Tooltip title={value}>
          <code>{value}</code>
        </Tooltip>
      ),
    },
    {
      title: '设备',
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <span style={{ fontWeight: 600 }}>{record.deviceName || '-'}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>{record.applicationName || record.applicationId}</span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'joined',
      width: 100,
      render: (value: boolean) => value ? <Tag color="success">已入网</Tag> : <Tag>未入网</Tag>,
    },
    {
      title: '上下行',
      width: 120,
      render: (_value, record) => (
        <Space size={4}>
          <Tag color="processing">{record.uplinkCount?.value || 0}</Tag>
          <Tag color="blue">{record.downlinkCount?.value || 0}</Tag>
        </Space>
      ),
    },
    {
      title: '链路质量',
      width: 160,
      render: (_value, record) => (
        <Space size={4} wrap>
          <Tag color={record.lastRssi > -100 ? 'success' : record.lastRssi > -120 ? 'warning' : 'error'}>
            RSSI {record.lastRssi} dBm
          </Tag>
          <Tag>SNR {record.lastSnr?.toFixed(1)} dB</Tag>
        </Space>
      ),
    },
    {
      title: '最近上行',
      dataIndex: 'lastUplinkTime',
      width: 130,
      render: (value: number) => (value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-'),
    },
    {
      title: '操作',
      width: 100,
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          icon={<SendOutlined />}
          onClick={() => {
            setDevEui(record.devEui);
            setActiveTab('downlink');
          }}
        >
          下行
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="LoRaWAN 接入"
        description="用于 LoRaWAN 设备状态查看、网络服务器接入确认和下行消息调试。"
      />

      <ProtocolAccessGuide
        title="LoRaWAN 设备接入后建议回到设备管理统一查看"
        description="LoRaWAN 页面侧重网络侧接入状态和下行调试；设备建立产品映射后，建议到设备管理、设备数据和规则告警页面继续使用统一的设备视角。"
        tips={['适合 ChirpStack、TTN 等网络服务器', '支持 Webhook 上报', '支持按 DevEUI 发起下行']}
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'devices',
            label: '设备状态',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="设备数" value={stats?.deviceCount || 0} prefix={<WifiOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="累计上行" value={stats?.totalUplinks || 0} prefix={<SignalFilled />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="累计下行" value={stats?.totalDownlinks || 0} prefix={<SendOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="网络服务器" value={stats?.networkServer || '-'} prefix={<CloudServerOutlined />} valueStyle={{ fontSize: 16 }} /></Card></Col>
                </Row>

                <Card style={cardStyle} extra={<Button icon={<ReloadOutlined />} onClick={() => void fetchAll()} loading={loading}>刷新</Button>}>
                  {devices.length === 0 && !loading ? (
                    <Empty description="暂无 LoRaWAN 设备" />
                  ) : (
                    <Table<LoRaDevice>
                      rowKey="devEui"
                      columns={columns}
                      dataSource={devices}
                      loading={loading}
                      scroll={{ x: 1040 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'downlink',
            label: '下行消息',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={12}>
                  <Card title={<Space><SendOutlined />发送下行</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input
                        addonBefore="DevEUI"
                        value={devEui}
                        onChange={(event) => setDevEui(event.target.value)}
                        placeholder="例如 0102030405060708"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <InputNumber
                        min={1}
                        max={255}
                        style={{ width: '100%' }}
                        addonBefore="fPort"
                        value={fPort}
                        onChange={(value) => setFPort(value || 1)}
                      />
                      <Input.TextArea
                        rows={6}
                        value={payload}
                        onChange={(event) => setPayload(event.target.value)}
                        placeholder='Base64 数据或 JSON 负载，例如 {"led":true}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void handleDownlink()}>
                        发送下行
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card title={<Space><WifiOutlined />Webhook 接入说明</Space>} style={cardStyle}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        在网络服务器侧配置 HTTP Integration(Webhook) 后，可将 LoRaWAN 上下行和状态事件推送到平台。
                      </Typography.Paragraph>
                      <div style={{ padding: 12, background: '#f8fafc', borderRadius: 12, fontFamily: 'monospace' }}>
                        <div><Tag color="blue">上行</Tag> POST /api/v1/lorawan/webhook/up</div>
                        <div><Tag color="green">Join</Tag> POST /api/v1/lorawan/webhook/join</div>
                        <div><Tag>ACK</Tag> POST /api/v1/lorawan/webhook/ack</div>
                        <div><Tag color="gold">状态</Tag> POST /api/v1/lorawan/webhook/status</div>
                        <div><Tag color="red">错误</Tag> POST /api/v1/lorawan/webhook/error</div>
                      </div>
                    </Space>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'config',
            label: '接入配置',
            children: config ? (
              <Card title={<Space><SettingOutlined />LoRaWAN 配置</Space>} style={cardStyle}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="启用状态">
                    <Tag color={config.enabled ? 'success' : 'default'}>{config.enabled ? '已启用' : '未启用'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="网络服务器">{config.networkServer}</Descriptions.Item>
                  <Descriptions.Item label="API 地址"><code>{config.apiUrl}</code></Descriptions.Item>
                  <Descriptions.Item label="Webhook 路径"><code>{config.webhookPath}</code></Descriptions.Item>
                  <Descriptions.Item label="载荷编解码">{config.payloadCodec}</Descriptions.Item>
                  <Descriptions.Item label="应用 ID">{config.applicationId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="下行类型">{config.downlinkClass}</Descriptions.Item>
                  <Descriptions.Item label="默认 fPort">{config.downlinkFPort}</Descriptions.Item>
                  <Descriptions.Item label="确认下行">
                    <Tag color={config.downlinkConfirmed ? 'warning' : 'default'}>
                      {config.downlinkConfirmed ? '是' : '否'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="去重窗口">{config.deduplicationWindowMs} ms</Descriptions.Item>
                </Descriptions>
              </Card>
            ) : (
              <Empty description="暂无接入配置" />
            ),
          },
        ]}
      />
    </div>
  );
};

export default LoRaWanPage;
