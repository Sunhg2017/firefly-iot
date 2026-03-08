import React, { useEffect, useState } from 'react';
import {
  Card, Button, Space, message, Table, Tag, Tabs, Statistic, Row, Col,
  Popconfirm, Input, Empty, Tooltip,
} from 'antd';
import {
  ApiOutlined, ReloadOutlined, SendOutlined,
  DisconnectOutlined, WifiOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { websocketApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
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

const WebSocketPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('sessions');

  // ==================== Sessions State ====================
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  // ==================== Messaging State ====================
  const [sendSessionId, setSendSessionId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // ==================== Fetch ====================

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const [sessRes, countRes] = await Promise.all([
        websocketApi.listSessions(),
        websocketApi.sessionCount(),
      ]);
      setSessions(sessRes.data.data || []);
      setSessionCount(countRes.data.data || 0);
    } catch {
      setSessions([]);
      setSessionCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  // ==================== Handlers ====================

  const handleDisconnect = async (sessionId: string) => {
    try {
      await websocketApi.disconnect(sessionId);
      message.success('已断开连接');
      fetchSessions();
    } catch {
      message.error('断开失败');
    }
  };

  const handleSend = async () => {
    if (!sendSessionId.trim() || !sendMessage.trim()) {
      message.warning('请输入会话ID和消息内容');
      return;
    }
    setSendLoading(true);
    try {
      const res = await websocketApi.send({ sessionId: sendSessionId.trim(), message: sendMessage.trim() });
      if (res.data.data) {
        message.success('发送成功');
      } else {
        message.warning('发送失败，会话可能不存在或已断开');
      }
    } catch {
      message.error('发送失败');
    } finally {
      setSendLoading(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      message.warning('请输入广播内容');
      return;
    }
    setBroadcastLoading(true);
    try {
      const res = await websocketApi.broadcast({ message: broadcastMessage.trim() });
      const data = res.data.data;
      message.success(`广播完成: ${data?.sent || 0}/${data?.total || 0} 个会话已接收`);
    } catch {
      message.error('广播失败');
    } finally {
      setBroadcastLoading(false);
    }
  };

  // ==================== Columns ====================

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

  const columns: ColumnsType<SessionInfo> = [
    { title: '会话ID', dataIndex: 'sessionId', width: 120, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><code style={{ fontSize: 11 }}>{v}</code></Tooltip> },
    { title: '设备ID', dataIndex: 'deviceId', width: 90,
      render: (v: number | null) => v ? <Tag color="blue">#{v}</Tag> : <Tag>未绑定</Tag> },
    { title: '设备名称', dataIndex: 'deviceName', width: 120, ellipsis: true,
      render: (v: string | null) => v || '-' },
    { title: '远端地址', dataIndex: 'remoteAddress', width: 160, ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
    { title: '连接时间', dataIndex: 'connectedAt', width: 110,
      render: (v: number) => <Tooltip title={formatTime(v)}><Space size={4}><ClockCircleOutlined />{formatDuration(v)}</Space></Tooltip> },
    { title: '最后消息', dataIndex: 'lastMessageAt', width: 110,
      render: (v: number) => v ? <Tooltip title={formatTime(v)}>{formatDuration(v)} 前</Tooltip> : '-' },
    { title: '消息数', dataIndex: 'messageCount', width: 80,
      render: (v: number) => <Tag color={v > 0 ? 'processing' : 'default'}>{v}</Tag> },
    {
      title: '操作', width: 140,
      render: (_: unknown, r: SessionInfo) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<SendOutlined />}
            onClick={() => { setSendSessionId(r.sessionId); setActiveTab('tools'); }}>
            发送
          </Button>
          <Popconfirm title="确认断开此连接？" onConfirm={() => handleDisconnect(r.sessionId)}>
            <Button type="link" size="small" danger icon={<DisconnectOutlined />}>断开</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="WebSocket 设备接入" description="WebSocket 实时连接管理、会话列表、下行消息推送" />

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'sessions', label: '在线会话',
          children: (
            <div>
              {/* Stats */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <Statistic title="在线连接数" value={sessionCount} prefix={<WifiOutlined />}
                      valueStyle={{ color: sessionCount > 0 ? '#52c41a' : undefined }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <Statistic title="已绑定设备" value={sessions.filter(s => s.deviceId).length} prefix={<ApiOutlined />} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <Statistic title="总消息数" value={sessions.reduce((sum, s) => sum + s.messageCount, 0)} prefix={<SendOutlined />} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <Statistic title="端点" value="/ws/device" valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} />
                  </Card>
                </Col>
              </Row>

              {/* Session Table */}
              <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                extra={<Button icon={<ReloadOutlined />} onClick={fetchSessions} loading={loading}>刷新</Button>}>
                {sessions.length === 0 && !loading ? (
                  <Empty description="暂无在线 WebSocket 连接" />
                ) : (
                  <Table rowKey="sessionId" columns={columns} dataSource={sessions} loading={loading}
                    size="small" pagination={{ pageSize: 20, showSizeChanger: true }} />
                )}
              </Card>
            </div>
          ),
        },
        {
          key: 'tools', label: '消息推送',
          children: (
            <Row gutter={16}>
              <Col span={12}>
                <Card title={<Space><SendOutlined /> 发送到指定会话</Space>}
                  style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Input placeholder="会话 ID" value={sendSessionId}
                      onChange={e => setSendSessionId(e.target.value)}
                      addonBefore="Session ID" style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    <Input.TextArea rows={6} placeholder='{"cmd": "readProperty", "params": {"key": "temperature"}}'
                      value={sendMessage} onChange={e => setSendMessage(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    <Button type="primary" icon={<SendOutlined />} onClick={handleSend}
                      loading={sendLoading} disabled={!sendSessionId.trim() || !sendMessage.trim()}>
                      发送消息
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card title={<Space><WifiOutlined /> 广播到所有会话</Space>}
                  style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Input.TextArea rows={8} placeholder='{"cmd": "syncTime", "timestamp": 1700000000000}'
                      value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    <Button type="primary" icon={<SendOutlined />} onClick={handleBroadcast}
                      loading={broadcastLoading} disabled={!broadcastMessage.trim()}>
                      广播消息 ({sessionCount} 个在线会话)
                    </Button>
                  </Space>
                </Card>
              </Col>
            </Row>
          ),
        },
      ]} />
    </div>
  );
};

export default WebSocketPage;
