import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Table,
  Tag,
  Tabs,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Input,
  Empty,
  Tooltip,
  InputNumber,
  Form,
  Modal,
} from 'antd';
import {
  ReloadOutlined,
  SendOutlined,
  DisconnectOutlined,
  WifiOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  SwapOutlined,
  ApiOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { tcpUdpApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import { formatDateTime } from '../../utils/datetime';

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
  productId?: number | null;
  deviceId?: number | null;
  deviceName?: string;
}

type BindingTarget =
  | {
      type: 'tcp';
      sessionId: string;
      remoteAddress: string;
      binding?: TcpUdpBinding | null;
    }
  | {
      type: 'udp';
      address: string;
      port: number;
      binding?: TcpUdpBinding | null;
    }
  | null;

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};

const targetCardStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: '#fafafa',
  borderRadius: 8,
};

const TcpUdpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tcp');

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

  const [bindingTarget, setBindingTarget] = useState<BindingTarget>(null);
  const [bindingSubmitting, setBindingSubmitting] = useState(false);
  const [bindingForm] = Form.useForm<BindingFormValues>();

  const fetchTcp = async () => {
    setTcpLoading(true);
    try {
      const [sessionResponse, countResponse] = await Promise.all([
        tcpUdpApi.listTcpSessions(),
        tcpUdpApi.tcpSessionCount(),
      ]);
      setTcpSessions(sessionResponse.data.data || []);
      setTcpCount(countResponse.data.data || 0);
    } catch {
      setTcpSessions([]);
      setTcpCount(0);
    } finally {
      setTcpLoading(false);
    }
  };

  const fetchUdp = async () => {
    setUdpLoading(true);
    try {
      const [peerResponse, statsResponse] = await Promise.all([
        tcpUdpApi.listUdpPeers(),
        tcpUdpApi.udpStats(),
      ]);
      setUdpPeers(peerResponse.data.data || []);
      setUdpStats(statsResponse.data.data || { peerCount: 0, totalReceived: 0 });
    } catch {
      setUdpPeers([]);
      setUdpStats({ peerCount: 0, totalReceived: 0 });
    } finally {
      setUdpLoading(false);
    }
  };

  useEffect(() => {
    void fetchTcp();
    void fetchUdp();
    const interval = window.setInterval(() => {
      void fetchTcp();
      void fetchUdp();
    }, 10000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!bindingTarget) {
      bindingForm.resetFields();
      return;
    }

    bindingForm.setFieldsValue({
      productId: bindingTarget.binding?.productId ?? undefined,
      deviceId: bindingTarget.binding?.deviceId ?? undefined,
      deviceName: bindingTarget.binding?.deviceName ?? undefined,
    });
  }, [bindingForm, bindingTarget]);

  const closeBindingModal = () => {
    setBindingTarget(null);
    bindingForm.resetFields();
  };

  const openTcpBindingModal = (session: TcpSession) => {
    setBindingTarget({
      type: 'tcp',
      sessionId: session.sessionId,
      remoteAddress: session.remoteAddress,
      binding: session.binding,
    });
  };

  const openUdpBindingModal = (peer: UdpPeer) => {
    setBindingTarget({
      type: 'udp',
      address: peer.address,
      port: peer.port,
      binding: peer.binding,
    });
  };

  const buildBindingPayload = (values: BindingFormValues) => {
    const payload: Record<string, unknown> = {
      productId: Number(values.productId),
    };

    if (typeof values.deviceId === 'number') {
      payload.deviceId = values.deviceId;
    }

    const deviceName = values.deviceName?.trim();
    if (deviceName) {
      payload.deviceName = deviceName;
    }

    return payload;
  };

  const handleBind = async (values: BindingFormValues) => {
    if (!bindingTarget) {
      return;
    }

    const target = bindingTarget;
    const payload = buildBindingPayload(values);
    const isTcpTarget = target.type === 'tcp';

    setBindingSubmitting(true);
    try {
      if (isTcpTarget) {
        await tcpUdpApi.bindTcpSession(target.sessionId, payload);
      } else {
        await tcpUdpApi.bindUdpPeer({
          ...payload,
          address: target.address,
          port: target.port,
        });
      }

      message.success(isTcpTarget ? 'TCP 会话绑定成功' : 'UDP 端点绑定成功');
      closeBindingModal();
      if (isTcpTarget) {
        await fetchTcp();
      } else {
        await fetchUdp();
      }
    } catch {
      message.error(isTcpTarget ? 'TCP 会话绑定失败' : 'UDP 端点绑定失败');
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
      message.error('TCP 断开失败');
    }
  };

  const handleSendTcp = async () => {
    if (!tcpSendSessionId.trim() || !tcpSendMessage.trim()) {
      message.warning('请输入会话 ID 和消息内容');
      return;
    }

    setTcpSendLoading(true);
    try {
      const response = await tcpUdpApi.sendTcp({
        sessionId: tcpSendSessionId.trim(),
        message: tcpSendMessage.trim(),
      });
      if (response.data.data) {
        message.success('TCP 消息发送成功');
      } else {
        message.warning('发送失败，会话可能已断开');
      }
    } catch {
      message.error('TCP 消息发送失败');
    } finally {
      setTcpSendLoading(false);
    }
  };

  const handleBroadcastTcp = async () => {
    if (!tcpBroadcastMessage.trim()) {
      message.warning('请输入广播消息内容');
      return;
    }

    setTcpBroadcastLoading(true);
    try {
      const response = await tcpUdpApi.broadcastTcp({ message: tcpBroadcastMessage.trim() });
      const result = response.data.data;
      message.success(`TCP 广播完成：${result?.sent || 0}/${result?.total || 0} 个会话`);
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
      const response = await tcpUdpApi.sendUdp({
        address: udpSendAddress.trim(),
        port: udpSendPort,
        message: udpSendMessage.trim(),
      });
      if (response.data.data) {
        message.success('UDP 消息发送成功');
      } else {
        message.warning('UDP 消息发送失败');
      }
    } catch {
      message.error('UDP 消息发送失败');
    } finally {
      setUdpSendLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) {
      return '-';
    }
    return formatDateTime(timestamp);
  };

  const formatDuration = (timestamp: number) => {
    if (!timestamp) {
      return '-';
    }

    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const renderBinding = (binding?: TcpUdpBinding | null) => {
    if (!binding?.productId) {
      return <Tag>未绑定</Tag>;
    }

    const hasDeviceContext = binding.deviceId || binding.deviceName;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Space wrap size={[4, 4]}>
          <Tag color="processing">产品 #{binding.productId}</Tag>
          {binding.productKey ? <Tag color="blue">{binding.productKey}</Tag> : null}
          {binding.tenantId ? <Tag>租户 #{binding.tenantId}</Tag> : null}
        </Space>
        <Space wrap size={[4, 4]}>
          {binding.deviceId ? <Tag color="green">设备 #{binding.deviceId}</Tag> : null}
          {binding.deviceName ? <Tag color="gold">{binding.deviceName}</Tag> : null}
          {binding.bindTime ? (
            <Tooltip title={formatTime(binding.bindTime)}>
              <Tag>{formatDuration(binding.bindTime)}前绑定</Tag>
            </Tooltip>
          ) : null}
        </Space>
        {!hasDeviceContext ? (
          <span style={{ color: '#999', fontSize: 12 }}>按产品上下文解析后续报文</span>
        ) : null}
      </div>
    );
  };

  const tcpBoundCount = tcpSessions.filter((session) => !!session.binding?.productId).length;
  const udpBoundCount = udpPeers.filter((peer) => !!peer.binding?.productId).length;

  const tcpColumns: ColumnsType<TcpSession> = [
    {
      title: '会话 ID',
      dataIndex: 'sessionId',
      width: 150,
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={value}>
          <code style={{ fontSize: 11 }}>{value}</code>
        </Tooltip>
      ),
    },
    {
      title: '远端地址',
      dataIndex: 'remoteAddress',
      width: 180,
      ellipsis: true,
      render: (value: string) => <code style={{ fontSize: 11 }}>{value}</code>,
    },
    {
      title: '绑定上下文',
      dataIndex: 'binding',
      width: 260,
      render: (binding?: TcpUdpBinding | null) => renderBinding(binding),
    },
    {
      title: '连接时间',
      dataIndex: 'connectTime',
      width: 120,
      render: (value: number) => (
        <Tooltip title={formatTime(value)}>
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
      render: (value: number) =>
        value ? (
          <Tooltip title={formatTime(value)}>{formatDuration(value)}前</Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '收/发',
      width: 110,
      render: (_: unknown, record: TcpSession) => (
        <Space size={4}>
          <Tag color="green">{record.receivedCount} 收</Tag>
          <Tag color="blue">{record.sentCount} 发</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_: unknown, record: TcpSession) => (
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
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => openTcpBindingModal(record)}
          >
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm title="确认解除此 TCP 会话绑定？" onConfirm={() => handleUnbindTcp(record.sessionId)}>
              <Button type="link" size="small" danger>
                解绑
              </Button>
            </Popconfirm>
          ) : null}
          <Popconfirm title="确认断开此 TCP 连接？" onConfirm={() => handleDisconnectTcp(record.sessionId)}>
            <Button type="link" size="small" danger icon={<DisconnectOutlined />}>
              断开
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const udpColumns: ColumnsType<UdpPeer> = [
    {
      title: '地址',
      dataIndex: 'address',
      width: 160,
      render: (value: string) => <code style={{ fontSize: 11 }}>{value}</code>,
    },
    {
      title: '端口',
      dataIndex: 'port',
      width: 90,
      render: (value: number) => <Tag>{value}</Tag>,
    },
    {
      title: '绑定上下文',
      dataIndex: 'binding',
      width: 260,
      render: (binding?: TcpUdpBinding | null) => renderBinding(binding),
    },
    {
      title: '首次发现',
      dataIndex: 'firstSeenTime',
      width: 120,
      render: (value: number) => (
        <Tooltip title={formatTime(value)}>{formatDuration(value)}前</Tooltip>
      ),
    },
    {
      title: '最后消息',
      dataIndex: 'lastMessageTime',
      width: 120,
      render: (value: number) =>
        value ? (
          <Tooltip title={formatTime(value)}>{formatDuration(value)}前</Tooltip>
        ) : (
          '-'
        ),
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
      render: (_: unknown, record: UdpPeer) => (
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
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => openUdpBindingModal(record)}
          >
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm title="确认解除此 UDP 端点绑定？" onConfirm={() => handleUnbindUdp(record.address, record.port)}>
              <Button type="link" size="small" danger>
                解绑
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="TCP/UDP 原始 Socket 接入"
        description="TCP 长连接管理、UDP 报文收发、会话绑定与自定义协议调试。"
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'tcp',
            label: 'TCP 会话',
            children: (
              <div>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic
                        title="TCP 在线连接"
                        value={tcpCount}
                        prefix={<WifiOutlined />}
                        valueStyle={{ color: tcpCount > 0 ? '#52c41a' : undefined }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic title="已绑定上下文" value={tcpBoundCount} prefix={<ApiOutlined />} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic
                        title="TCP 端口"
                        value={8900}
                        prefix={<CloudServerOutlined />}
                        valueStyle={{ fontSize: 18, fontFamily: 'monospace' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic title="帧解码" value="LINE (换行分隔)" valueStyle={{ fontSize: 14 }} />
                    </Card>
                  </Col>
                </Row>

                <Card
                  style={cardStyle}
                  extra={
                    <Button icon={<ReloadOutlined />} onClick={() => void fetchTcp()} loading={tcpLoading}>
                      刷新
                    </Button>
                  }
                >
                  {tcpSessions.length === 0 && !tcpLoading ? (
                    <Empty description="暂无 TCP 连接" />
                  ) : (
                    <Table
                      rowKey="sessionId"
                      columns={tcpColumns}
                      dataSource={tcpSessions}
                      loading={tcpLoading}
                      size="small"
                      scroll={{ x: 1180 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'udp',
            label: 'UDP 端点',
            children: (
              <div>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic title="UDP 已知端点" value={udpStats.peerCount} prefix={<SwapOutlined />} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic title="已绑定上下文" value={udpBoundCount} prefix={<ApiOutlined />} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic
                        title="UDP 总接收"
                        value={udpStats.totalReceived}
                        prefix={<SendOutlined />}
                        valueStyle={{ color: udpStats.totalReceived > 0 ? '#1677ff' : undefined }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={cardStyle}>
                      <Statistic
                        title="UDP 端口"
                        value={8901}
                        prefix={<CloudServerOutlined />}
                        valueStyle={{ fontSize: 18, fontFamily: 'monospace' }}
                      />
                    </Card>
                  </Col>
                </Row>

                <Card
                  style={cardStyle}
                  extra={
                    <Button icon={<ReloadOutlined />} onClick={() => void fetchUdp()} loading={udpLoading}>
                      刷新
                    </Button>
                  }
                >
                  {udpPeers.length === 0 && !udpLoading ? (
                    <Empty description="暂无 UDP 端点" />
                  ) : (
                    <Table
                      rowKey={(record) => `${record.address}:${record.port}`}
                      columns={udpColumns}
                      dataSource={udpPeers}
                      loading={udpLoading}
                      size="small"
                      scroll={{ x: 1080 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'tools',
            label: '消息下发',
            children: (
              <Row gutter={16}>
                <Col span={8}>
                  <Card title={<Space><SendOutlined /> TCP 发送</Space>} style={cardStyle}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Input
                        placeholder="TCP 会话 ID"
                        value={tcpSendSessionId}
                        onChange={(event) => setTcpSendSessionId(event.target.value)}
                        addonBefore="Session"
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <Input.TextArea
                        rows={5}
                        placeholder='{"temperature": 25.5}'
                        value={tcpSendMessage}
                        onChange={(event) => setTcpSendMessage(event.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleSendTcp}
                        loading={tcpSendLoading}
                        disabled={!tcpSendSessionId.trim() || !tcpSendMessage.trim()}
                      >
                        发送 TCP
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title={<Space><WifiOutlined /> TCP 广播</Space>} style={cardStyle}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Input.TextArea
                        rows={7}
                        placeholder='{"cmd": "syncTime"}'
                        value={tcpBroadcastMessage}
                        onChange={(event) => setTcpBroadcastMessage(event.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleBroadcastTcp}
                        loading={tcpBroadcastLoading}
                        disabled={!tcpBroadcastMessage.trim()}
                      >
                        广播到 {tcpCount} 个 TCP 会话
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title={<Space><SwapOutlined /> UDP 发送</Space>} style={cardStyle}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Input
                        placeholder="目标地址"
                        value={udpSendAddress}
                        onChange={(event) => setUdpSendAddress(event.target.value)}
                        addonBefore="Address"
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <InputNumber
                        min={1}
                        max={65535}
                        value={udpSendPort}
                        onChange={(value) => setUdpSendPort(value || 8901)}
                        addonBefore="Port"
                        style={{ width: '100%' }}
                      />
                      <Input.TextArea
                        rows={4}
                        placeholder='{"temperature": 25.5}'
                        value={udpSendMessage}
                        onChange={(event) => setUdpSendMessage(event.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleSendUdp}
                        loading={udpSendLoading}
                        disabled={!udpSendAddress.trim() || !udpSendMessage.trim()}
                      >
                        发送 UDP
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
        title={bindingTarget?.type === 'tcp' ? '绑定 TCP 会话' : '绑定 UDP 端点'}
        open={!!bindingTarget}
        onCancel={closeBindingModal}
        onOk={() => bindingForm.submit()}
        confirmLoading={bindingSubmitting}
        width={520}
      >
        {bindingTarget ? (
          <div style={targetCardStyle}>
            <div style={{ marginBottom: 8, color: '#666' }}>绑定目标</div>
            <Space wrap size={[8, 8]}>
              <Tag color="processing">{bindingTarget.type === 'tcp' ? 'TCP 会话' : 'UDP 端点'}</Tag>
              {bindingTarget.type === 'tcp' ? (
                <>
                  <code style={{ fontSize: 12 }}>{bindingTarget.sessionId}</code>
                  <Tag>{bindingTarget.remoteAddress}</Tag>
                </>
              ) : (
                <code style={{ fontSize: 12 }}>
                  {bindingTarget.address}:{bindingTarget.port}
                </code>
              )}
            </Space>
          </div>
        ) : null}

        <div style={{ color: '#666', marginBottom: 16 }}>
          绑定后，后续报文会携带产品/设备上下文进入自定义协议解析链路。
        </div>

        <Form form={bindingForm} layout="vertical" onFinish={handleBind}>
          <Form.Item
            name="productId"
            label="产品 ID"
            rules={[{ required: true, message: '请输入产品 ID' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="请输入产品 ID" />
          </Form.Item>
          <Form.Item name="deviceId" label="设备 ID">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="可选，指定设备 ID" />
          </Form.Item>
          <Form.Item name="deviceName" label="设备名称">
            <Input placeholder="可选，指定设备名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TcpUdpPage;
