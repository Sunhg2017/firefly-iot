import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
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
  ApiOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  DisconnectOutlined,
  LinkOutlined,
  ReloadOutlined,
  SendOutlined,
  SwapOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import { deviceApi, productApi, tcpUdpApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
}

interface DeviceOption {
  id: number;
  deviceName: string;
  nickname?: string;
  productId: number;
}

interface TcpUdpBinding {
  tenantId?: number | null;
  productId?: number | null;
  productKey?: string | null;
  deviceId?: number | null;
  deviceName?: string | null;
  bindTime?: number;
}

interface TcpSession {
  sessionId: string;
  channelId: string;
  protocol: string;
  remoteAddress: string;
  connectTime: number;
  lastMessageTime: number;
  receivedCount: number;
  sentCount: number;
  binding?: TcpUdpBinding | null;
}

interface UdpPeer {
  address: string;
  port: number;
  firstSeenTime: number;
  lastMessageTime: number;
  receivedCount: number;
  binding?: TcpUdpBinding | null;
}

interface BindingFormValues {
  productId?: number;
  deviceId?: number;
}

type BindingTarget =
  | { type: 'tcp'; sessionId: string; remoteAddress: string; binding?: TcpUdpBinding | null }
  | { type: 'udp'; address: string; port: number; binding?: TcpUdpBinding | null }
  | null;

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
};

const TcpUdpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tcp');
  const [bindingForm] = Form.useForm<BindingFormValues>();

  const [tcpSessions, setTcpSessions] = useState<TcpSession[]>([]);
  const [tcpLoading, setTcpLoading] = useState(false);
  const [tcpCount, setTcpCount] = useState(0);

  const [udpPeers, setUdpPeers] = useState<UdpPeer[]>([]);
  const [udpLoading, setUdpLoading] = useState(false);
  const [udpStats, setUdpStats] = useState<{ peerCount: number; totalReceived: number }>({
    peerCount: 0,
    totalReceived: 0,
  });

  const [tcpSendSessionId, setTcpSendSessionId] = useState('');
  const [tcpSendMessage, setTcpSendMessage] = useState('');
  const [tcpSendLoading, setTcpSendLoading] = useState(false);
  const [tcpBroadcastMessage, setTcpBroadcastMessage] = useState('');
  const [tcpBroadcastLoading, setTcpBroadcastLoading] = useState(false);

  const [udpSendAddress, setUdpSendAddress] = useState('');
  const [udpSendPort, setUdpSendPort] = useState(8901);
  const [udpSendMessage, setUdpSendMessage] = useState('');
  const [udpSendLoading, setUdpSendLoading] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);
  const [bindingTarget, setBindingTarget] = useState<BindingTarget>(null);
  const [bindingSubmitting, setBindingSubmitting] = useState(false);

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const deviceMap = useMemo(() => new Map(devices.map((item) => [item.id, item])), [devices]);

  const fetchContextOptions = useCallback(async () => {
    try {
      const [productRes, deviceRes] = await Promise.all([
        productApi.list({ pageNum: 1, pageSize: 500 }),
        deviceApi.list({ pageNum: 1, pageSize: 500 }),
      ]);
      const productRecords = productRes.data?.data?.records ?? [];
      const deviceRecords = deviceRes.data?.data?.records ?? [];

      const nextProducts = productRecords.map((item: ProductOption) => ({
        id: item.id,
        productKey: item.productKey,
        name: item.name,
      }));
      const nextDevices = deviceRecords.map((item: DeviceOption) => ({
        id: item.id,
        deviceName: item.deviceName,
        nickname: item.nickname,
        productId: item.productId,
      }));

      setProducts(nextProducts);
      setDevices(nextDevices);
      setFilteredDevices(nextDevices);
    } catch {
      setProducts([]);
      setDevices([]);
      setFilteredDevices([]);
    }
  }, []);

  const fetchTcp = useCallback(async () => {
    setTcpLoading(true);
    try {
      const [sessionRes, countRes] = await Promise.all([
        tcpUdpApi.listTcpSessions(),
        tcpUdpApi.tcpSessionCount(),
      ]);
      setTcpSessions(sessionRes.data?.data ?? []);
      setTcpCount(countRes.data?.data ?? 0);
    } catch {
      setTcpSessions([]);
      setTcpCount(0);
    } finally {
      setTcpLoading(false);
    }
  }, []);

  const fetchUdp = useCallback(async () => {
    setUdpLoading(true);
    try {
      const [peerRes, statsRes] = await Promise.all([
        tcpUdpApi.listUdpPeers(),
        tcpUdpApi.udpStats(),
      ]);
      setUdpPeers(peerRes.data?.data ?? []);
      setUdpStats(statsRes.data?.data ?? { peerCount: 0, totalReceived: 0 });
    } catch {
      setUdpPeers([]);
      setUdpStats({ peerCount: 0, totalReceived: 0 });
    } finally {
      setUdpLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContextOptions();
    void fetchTcp();
    void fetchUdp();
    const timer = window.setInterval(() => {
      void fetchTcp();
      void fetchUdp();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchContextOptions, fetchTcp, fetchUdp]);

  useEffect(() => {
    if (!bindingTarget) {
      bindingForm.resetFields();
      setFilteredDevices(devices);
      return;
    }

    bindingForm.setFieldsValue({
      productId: bindingTarget.binding?.productId ?? undefined,
      deviceId: bindingTarget.binding?.deviceId ?? undefined,
    });

    if (bindingTarget.binding?.productId) {
      setFilteredDevices(devices.filter((item) => item.productId === bindingTarget.binding?.productId));
    } else {
      setFilteredDevices(devices);
    }
  }, [bindingTarget, bindingForm, devices]);

  const formatDuration = (timestamp: number) => {
    if (!timestamp) return '-';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handleProductChange = (productId?: number) => {
    bindingForm.setFieldValue('deviceId', undefined);
    if (productId) {
      setFilteredDevices(devices.filter((item) => item.productId === productId));
      return;
    }
    setFilteredDevices(devices);
  };

  const buildBindingPayload = (values: BindingFormValues) => {
    const payload: Record<string, unknown> = {
      productId: Number(values.productId),
    };

    if (typeof values.deviceId === 'number') {
      const device = deviceMap.get(values.deviceId);
      payload.deviceId = values.deviceId;
      payload.deviceName = device?.deviceName || undefined;
    }
    return payload;
  };

  const handleBind = async () => {
    if (!bindingTarget) {
      return;
    }

    try {
      const values = await bindingForm.validateFields();
      const payload = buildBindingPayload(values);
      setBindingSubmitting(true);

      if (bindingTarget.type === 'tcp') {
        await tcpUdpApi.bindTcpSession(bindingTarget.sessionId, payload);
        message.success('TCP 会话绑定成功');
        await fetchTcp();
      } else {
        await tcpUdpApi.bindUdpPeer({
          ...payload,
          address: bindingTarget.address,
          port: bindingTarget.port,
        });
        message.success('UDP 端点绑定成功');
        await fetchUdp();
      }

      setBindingTarget(null);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error('绑定上下文失败');
    } finally {
      setBindingSubmitting(false);
    }
  };

  const handleUnbindTcp = async (sessionId: string) => {
    try {
      await tcpUdpApi.unbindTcpSession(sessionId);
      message.success('TCP 会话已解绑');
      await fetchTcp();
    } catch {
      message.error('TCP 会话解绑失败');
    }
  };

  const handleUnbindUdp = async (address: string, port: number) => {
    try {
      await tcpUdpApi.unbindUdpPeer(address, port);
      message.success('UDP 端点已解绑');
      await fetchUdp();
    } catch {
      message.error('UDP 端点解绑失败');
    }
  };

  const handleDisconnectTcp = async (sessionId: string) => {
    try {
      await tcpUdpApi.disconnectTcp(sessionId);
      message.success('TCP 连接已断开');
      await fetchTcp();
    } catch {
      message.error('断开 TCP 连接失败');
    }
  };

  const handleSendTcp = async () => {
    if (!tcpSendSessionId.trim() || !tcpSendMessage.trim()) {
      message.warning('请输入会话 ID 和消息内容');
      return;
    }
    setTcpSendLoading(true);
    try {
      const res = await tcpUdpApi.sendTcp({
        sessionId: tcpSendSessionId.trim(),
        message: tcpSendMessage.trim(),
      });
      message[res.data?.data ? 'success' : 'warning'](res.data?.data ? 'TCP 消息发送成功' : 'TCP 消息发送失败');
    } catch {
      message.error('TCP 消息发送失败');
    } finally {
      setTcpSendLoading(false);
    }
  };

  const handleBroadcastTcp = async () => {
    if (!tcpBroadcastMessage.trim()) {
      message.warning('请输入广播消息');
      return;
    }
    setTcpBroadcastLoading(true);
    try {
      const res = await tcpUdpApi.broadcastTcp({ message: tcpBroadcastMessage.trim() });
      const result = res.data?.data ?? {};
      message.success(`TCP 广播完成，成功送达 ${result.sent || 0} / ${result.total || 0} 个会话`);
    } catch {
      message.error('TCP 广播失败');
    } finally {
      setTcpBroadcastLoading(false);
    }
  };

  const handleSendUdp = async () => {
    if (!udpSendAddress.trim() || !udpSendMessage.trim()) {
      message.warning('请输入目标地址和消息内容');
      return;
    }
    setUdpSendLoading(true);
    try {
      const res = await tcpUdpApi.sendUdp({
        address: udpSendAddress.trim(),
        port: udpSendPort,
        message: udpSendMessage.trim(),
      });
      message[res.data?.data ? 'success' : 'warning'](res.data?.data ? 'UDP 消息发送成功' : 'UDP 消息发送失败');
    } catch {
      message.error('UDP 消息发送失败');
    } finally {
      setUdpSendLoading(false);
    }
  };

  const renderBinding = (binding?: TcpUdpBinding | null) => {
    if (!binding?.productId) {
      return <Tag>未绑定</Tag>;
    }

    const product = productMap.get(binding.productId);
    const device = binding.deviceId ? deviceMap.get(binding.deviceId) : undefined;

    return (
      <Space direction="vertical" size={2}>
        <Typography.Text strong>{product?.name || binding.productKey || `产品 ${binding.productId}`}</Typography.Text>
        <Space size={6} wrap>
          {product?.productKey || binding.productKey ? <Tag color="processing">{product?.productKey || binding.productKey}</Tag> : null}
          {device?.nickname || binding.deviceName ? <Tag color="green">{device?.nickname || binding.deviceName}</Tag> : null}
          {device?.deviceName ? <Tag>{device.deviceName}</Tag> : null}
        </Space>
        {binding.bindTime ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            绑定于 {formatDateTime(binding.bindTime)}
          </Typography.Text>
        ) : null}
      </Space>
    );
  };

  const tcpColumns: ColumnsType<TcpSession> = [
    {
      title: '会话 ID',
      dataIndex: 'sessionId',
      width: 180,
      render: (value: string) => (
        <Tooltip title={value}>
          <code>{value}</code>
        </Tooltip>
      ),
    },
    {
      title: '远端地址',
      dataIndex: 'remoteAddress',
      width: 180,
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: '设备上下文',
      width: 240,
      render: (_value, record) => renderBinding(record.binding),
    },
    {
      title: '连接时长',
      dataIndex: 'connectTime',
      width: 120,
      render: (value: number) => (
        <Tooltip title={formatDateTime(value)}>
          <Space size={4}>
            <ClockCircleOutlined />
            {formatDuration(value)}
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '最后消息',
      dataIndex: 'lastMessageTime',
      width: 120,
      render: (value: number) => (value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-'),
    },
    {
      title: '收 / 发',
      width: 120,
      render: (_value, record) => (
        <Space size={4}>
          <Tag color="green">{record.receivedCount}</Tag>
          <Tag color="blue">{record.sentCount}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_value, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            onClick={() => {
              setTcpSendSessionId(record.sessionId);
              setActiveTab('tools');
            }}
          >
            发送
          </Button>
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => setBindingTarget({
            type: 'tcp',
            sessionId: record.sessionId,
            remoteAddress: record.remoteAddress,
            binding: record.binding,
          })}>
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm title="确认解绑该 TCP 会话？" onConfirm={() => void handleUnbindTcp(record.sessionId)}>
              <Button type="link" size="small" danger>解绑</Button>
            </Popconfirm>
          ) : null}
          <Popconfirm title="确认断开该 TCP 连接？" onConfirm={() => void handleDisconnectTcp(record.sessionId)}>
            <Button type="link" size="small" danger icon={<DisconnectOutlined />}>断开</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const udpColumns: ColumnsType<UdpPeer> = [
    {
      title: '地址',
      dataIndex: 'address',
      width: 180,
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: '端口',
      dataIndex: 'port',
      width: 100,
      render: (value: number) => <Tag>{value}</Tag>,
    },
    {
      title: '设备上下文',
      width: 240,
      render: (_value, record) => renderBinding(record.binding),
    },
    {
      title: '首次发现',
      dataIndex: 'firstSeenTime',
      width: 120,
      render: (value: number) => <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip>,
    },
    {
      title: '最后消息',
      dataIndex: 'lastMessageTime',
      width: 120,
      render: (value: number) => (value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-'),
    },
    {
      title: '接收数',
      dataIndex: 'receivedCount',
      width: 100,
      render: (value: number) => <Tag color={value > 0 ? 'processing' : 'default'}>{value}</Tag>,
    },
    {
      title: '操作',
      width: 180,
      render: (_value, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            onClick={() => {
              setUdpSendAddress(record.address);
              setUdpSendPort(record.port);
              setActiveTab('tools');
            }}
          >
            发送
          </Button>
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => setBindingTarget({
            type: 'udp',
            address: record.address,
            port: record.port,
            binding: record.binding,
          })}>
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm title="确认解绑该 UDP 端点？" onConfirm={() => void handleUnbindUdp(record.address, record.port)}>
              <Button type="link" size="small" danger>解绑</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const tcpBoundCount = tcpSessions.filter((item) => item.binding?.productId).length;
  const udpBoundCount = udpPeers.filter((item) => item.binding?.productId).length;

  return (
    <div>
      <PageHeader
        title="TCP/UDP 原始 Socket 接入"
        description="用于原始报文会话查看、设备上下文绑定和 Socket 消息调试。"
      />

      <ProtocolAccessGuide
        title="先绑定产品和设备，再进入自定义协议解析"
        description="TCP/UDP 原始连接本身没有业务语义，建议先把会话绑定到产品或设备，再由协议解析器消费后续报文，这样设备管理、规则引擎和告警通知才能共享上下文。"
        tips={['适合自定义二进制协议', '支持 TCP 会话和 UDP 端点绑定', '绑定后可进入协议解析链路']}
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'tcp',
            label: 'TCP 会话',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="TCP 在线连接" value={tcpCount} prefix={<WifiOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="已绑定上下文" value={tcpBoundCount} prefix={<ApiOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="TCP 端口" value={8900} prefix={<CloudServerOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="解码入口" value="协议解析" valueStyle={{ fontSize: 16 }} /></Card></Col>
                </Row>

                <Card style={cardStyle} extra={<Button icon={<ReloadOutlined />} onClick={() => void fetchTcp()} loading={tcpLoading}>刷新</Button>}>
                  {tcpSessions.length === 0 && !tcpLoading ? (
                    <Empty description="暂无 TCP 会话" />
                  ) : (
                    <Table<TcpSession>
                      rowKey="sessionId"
                      columns={tcpColumns}
                      dataSource={tcpSessions}
                      loading={tcpLoading}
                      scroll={{ x: 1240 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'udp',
            label: 'UDP 端点',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="UDP 端点数" value={udpStats.peerCount} prefix={<SwapOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="已绑定上下文" value={udpBoundCount} prefix={<ApiOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="累计接收报文" value={udpStats.totalReceived} prefix={<SendOutlined />} /></Card></Col>
                  <Col xs={24} md={6}><Card style={cardStyle}><Statistic title="UDP 端口" value={8901} prefix={<CloudServerOutlined />} /></Card></Col>
                </Row>

                <Card style={cardStyle} extra={<Button icon={<ReloadOutlined />} onClick={() => void fetchUdp()} loading={udpLoading}>刷新</Button>}>
                  {udpPeers.length === 0 && !udpLoading ? (
                    <Empty description="暂无 UDP 端点" />
                  ) : (
                    <Table<UdpPeer>
                      rowKey={(record) => `${record.address}:${record.port}`}
                      columns={udpColumns}
                      dataSource={udpPeers}
                      loading={udpLoading}
                      scroll={{ x: 1140 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'tools',
            label: '消息调试',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={8}>
                  <Card title={<Space><SendOutlined />发送 TCP</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input
                        addonBefore="Session"
                        value={tcpSendSessionId}
                        onChange={(event) => setTcpSendSessionId(event.target.value)}
                        placeholder="输入 TCP 会话 ID"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Input.TextArea
                        rows={6}
                        value={tcpSendMessage}
                        onChange={(event) => setTcpSendMessage(event.target.value)}
                        placeholder='{"temperature":25.5}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={tcpSendLoading} onClick={() => void handleSendTcp()}>
                        发送 TCP 消息
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} xl={8}>
                  <Card title={<Space><WifiOutlined />TCP 广播</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input.TextArea
                        rows={8}
                        value={tcpBroadcastMessage}
                        onChange={(event) => setTcpBroadcastMessage(event.target.value)}
                        placeholder='{"cmd":"syncTime"}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={tcpBroadcastLoading} onClick={() => void handleBroadcastTcp()}>
                        广播到 {tcpCount} 个 TCP 会话
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} xl={8}>
                  <Card title={<Space><SwapOutlined />发送 UDP</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input
                        addonBefore="Address"
                        value={udpSendAddress}
                        onChange={(event) => setUdpSendAddress(event.target.value)}
                        placeholder="目标地址"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <InputNumber
                        min={1}
                        max={65535}
                        style={{ width: '100%' }}
                        addonBefore="Port"
                        value={udpSendPort}
                        onChange={(value) => setUdpSendPort(value || 8901)}
                      />
                      <Input.TextArea
                        rows={5}
                        value={udpSendMessage}
                        onChange={(event) => setUdpSendMessage(event.target.value)}
                        placeholder='{"temperature":25.5}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={udpSendLoading} onClick={() => void handleSendUdp()}>
                        发送 UDP 消息
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />

      <Modal
        destroyOnClose
        title={bindingTarget?.type === 'tcp' ? '绑定 TCP 会话' : '绑定 UDP 端点'}
        open={Boolean(bindingTarget)}
        onCancel={() => setBindingTarget(null)}
        onOk={() => void handleBind()}
        confirmLoading={bindingSubmitting}
      >
        {bindingTarget ? (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">当前目标</Typography.Text>
              <Space wrap>
                <Tag color="processing">{bindingTarget.type === 'tcp' ? 'TCP 会话' : 'UDP 端点'}</Tag>
                {bindingTarget.type === 'tcp' ? (
                  <>
                    <code>{bindingTarget.sessionId}</code>
                    <Tag>{bindingTarget.remoteAddress}</Tag>
                  </>
                ) : (
                  <code>{bindingTarget.address}:{bindingTarget.port}</code>
                )}
              </Space>
            </Space>
          </Card>
        ) : null}

        <Typography.Paragraph type="secondary">
          绑定后，后续原始报文会带上产品和设备上下文，便于协议解析、设备数据归集和告警处理统一使用。
        </Typography.Paragraph>

        <Form form={bindingForm} layout="vertical">
          <Form.Item
            name="productId"
            label="关联产品"
            rules={[{ required: true, message: '请选择产品' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择产品"
              options={products.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.productKey})`,
              }))}
              onChange={handleProductChange}
            />
          </Form.Item>
          <Form.Item name="deviceId" label="关联设备">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="可选，绑定到具体设备"
              options={filteredDevices.map((item) => ({
                value: item.id,
                label: item.nickname ? `${item.nickname} (${item.deviceName})` : item.deviceName,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TcpUdpPage;
