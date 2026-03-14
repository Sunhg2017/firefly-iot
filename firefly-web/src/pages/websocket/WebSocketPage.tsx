import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  Popconfirm,
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
  ApiOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  SendOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import { websocketApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

interface SessionInfo {
  sessionId: string;
  deviceId: number | null;
  productId: number | null;
  tenantId: number | null;
  deviceName: string | null;
  remoteAddress: string;
  connectedAt: number;
  lastMessageAt: number;
  messageCount: number;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
};

const WebSocketPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sendSessionId, setSendSessionId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const [sessionRes, countRes] = await Promise.all([
        websocketApi.listSessions(),
        websocketApi.sessionCount(),
      ]);
      setSessions(sessionRes.data?.data ?? []);
      setSessionCount(countRes.data?.data ?? 0);
    } catch {
      setSessions([]);
      setSessionCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSessions();
    const timer = window.setInterval(() => {
      void fetchSessions();
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const formatDuration = (timestamp: number) => {
    if (!timestamp) {
      return '-';
    }
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await websocketApi.disconnect(sessionId);
      message.success('连接已断开');
      void fetchSessions();
    } catch {
      message.error('断开连接失败');
    }
  };

  const handleSend = async () => {
    if (!sendSessionId.trim() || !sendMessage.trim()) {
      message.warning('请输入会话 ID 和消息内容');
      return;
    }

    setSendLoading(true);
    try {
      const res = await websocketApi.send({
        sessionId: sendSessionId.trim(),
        message: sendMessage.trim(),
      });
      message[res.data?.data ? 'success' : 'warning'](res.data?.data ? '消息发送成功' : '消息发送失败');
    } catch {
      message.error('消息发送失败');
    } finally {
      setSendLoading(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      message.warning('请输入广播消息');
      return;
    }

    setBroadcastLoading(true);
    try {
      const res = await websocketApi.broadcast({ message: broadcastMessage.trim() });
      const result = res.data?.data ?? {};
      message.success(`广播完成，成功送达 ${result.sent || 0} / ${result.total || 0} 个会话`);
    } catch {
      message.error('广播消息失败');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const columns: ColumnsType<SessionInfo> = [
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
      title: '设备上下文',
      width: 220,
      render: (_value, record) => (
        record.deviceName ? (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{record.deviceName}</Typography.Text>
            <Space size={6} wrap>
              {record.productId ? <Tag color="processing">产品 #{record.productId}</Tag> : null}
              {record.deviceId ? <Tag color="green">设备 #{record.deviceId}</Tag> : null}
            </Space>
          </Space>
        ) : (
          <Tag>未识别设备</Tag>
        )
      ),
    },
    {
      title: '远端地址',
      dataIndex: 'remoteAddress',
      width: 180,
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: '连接时长',
      dataIndex: 'connectedAt',
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
      dataIndex: 'lastMessageAt',
      width: 120,
      render: (value: number) => (
        value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-'
      ),
    },
    {
      title: '消息数',
      dataIndex: 'messageCount',
      width: 100,
      render: (value: number) => <Tag color={value > 0 ? 'processing' : 'default'}>{value}</Tag>,
    },
    {
      title: '操作',
      width: 160,
      render: (_value, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            onClick={() => {
              setSendSessionId(record.sessionId);
              setActiveTab('message');
            }}
          >
            发送
          </Button>
          <Popconfirm title="确认断开该连接？" onConfirm={() => void handleDisconnect(record.sessionId)}>
            <Button type="link" size="small" danger icon={<DisconnectOutlined />}>
              断开
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="WebSocket 接入"
        description="用于长连接设备在线会话查看、消息下发和广播调试。"
      />

      <ProtocolAccessGuide
        title="把 WebSocket 在线连接纳入设备管理链路"
        description="如果设备已经完成产品认证，WebSocket 会话会自动带上设备上下文。这样消息下发、规则处理和运行排障可以围绕同一台设备展开。"
        endpoint="/ws/device"
        tips={['适合双向实时设备', '支持定向消息与广播', '在线会话自动刷新']}
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'sessions',
            label: '在线会话',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="在线连接数" value={sessionCount} prefix={<WifiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="已识别设备" value={sessions.filter((item) => item.deviceId).length} prefix={<ApiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="累计会话消息" value={sessions.reduce((sum, item) => sum + item.messageCount, 0)} prefix={<SendOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="接入端点" value="/ws/device" valueStyle={{ fontSize: 16, fontFamily: 'monospace' }} />
                    </Card>
                  </Col>
                </Row>

                <Card
                  style={cardStyle}
                  extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchSessions()}>刷新</Button>}
                >
                  {sessions.length === 0 && !loading ? (
                    <Empty description="暂无在线 WebSocket 会话" />
                  ) : (
                    <Table<SessionInfo>
                      rowKey="sessionId"
                      columns={columns}
                      dataSource={sessions}
                      loading={loading}
                      scroll={{ x: 1080 }}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'message',
            label: '消息下发',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={12}>
                  <Card title={<Space><SendOutlined />定向发送</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input
                        addonBefore="Session"
                        value={sendSessionId}
                        onChange={(event) => setSendSessionId(event.target.value)}
                        placeholder="输入会话 ID"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Input.TextArea
                        rows={7}
                        value={sendMessage}
                        onChange={(event) => setSendMessage(event.target.value)}
                        placeholder='{"cmd":"readProperty","params":{"key":"temperature"}}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={sendLoading} onClick={() => void handleSend()}>
                        发送消息
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card title={<Space><WifiOutlined />广播消息</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input.TextArea
                        rows={10}
                        value={broadcastMessage}
                        onChange={(event) => setBroadcastMessage(event.target.value)}
                        placeholder='{"cmd":"syncTime","timestamp":1700000000000}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={broadcastLoading} onClick={() => void handleBroadcast()}>
                        广播到 {sessionCount} 个在线会话
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
};

export default WebSocketPage;
