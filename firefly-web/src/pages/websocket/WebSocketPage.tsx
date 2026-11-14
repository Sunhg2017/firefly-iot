import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
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
  SearchOutlined,
  SendOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { websocketApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { usePendingAction } from '../../hooks/usePendingAction';

interface SessionInfo {
  sessionId: string;
  deviceId: number | null;
  productId: number | null;
  /** 业务键：产品标识，用于替代产品主键展示。 */
  productKey: string | null;
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

const formatClock = (value: Date | null) => (value ? dayjs(value).format('HH:mm:ss') : '--:--:--');

const formatDuration = (timestamp: number) => {
  if (!timestamp) {
    return '-';
  }
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const WebSocketPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState('');
  const [sendSessionId, setSendSessionId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const disconnectAction = usePendingAction();

  const fetchSessions = useCallback(async () => {
    try {
      const [sessionRes, countRes] = await Promise.all([
        websocketApi.listSessions(),
        websocketApi.sessionCount(),
      ]);
      setSessions(sessionRes.data?.data ?? []);
      setSessionCount(countRes.data?.data ?? 0);
      setLoadError(null);
    } catch (error) {
      // 请求失败时保留上一次的会话列表，由 Alert 明确提示失败原因。
      setLoadError(getErrorMessage(error, '加载 WebSocket 会话失败'));
    }
  }, []);

  // 会话列表为实时状态，10 秒自动刷新；用户暂停后不再请求。
  const { paused, togglePaused, lastUpdatedAt, refresh } = useAutoRefresh(fetchSessions, {
    intervalMs: 10000,
    immediate: false,
  });

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh().finally(() => {
      if (active) {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const getSessionLabel = (sessionId: string) => {
    const session = sessions.find((item) => item.sessionId === sessionId);
    if (!session) {
      return sessionId;
    }
    return session.deviceName
      ? `${session.sessionId}（${session.deviceName} / ${session.remoteAddress}）`
      : `${session.sessionId}（${session.remoteAddress}）`;
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await websocketApi.disconnect(sessionId);
    } catch (error) {
      message.error(`${getErrorMessage(error, '断开连接失败')}（会话 ${sessionId}）`);
      return;
    }
    message.success(`会话 ${sessionId} 已断开`);
    await fetchSessions();
  };

  const handleSend = async () => {
    const sessionId = sendSessionId.trim();
    const content = sendMessage.trim();
    if (!sessionId || !content) {
      message.warning('请选择目标会话并填写消息内容');
      return;
    }
    if (sendLoading) {
      return;
    }

    setSendLoading(true);
    const target = getSessionLabel(sessionId);
    try {
      const res = await websocketApi.send({ sessionId, message: content });
      if (res.data?.data) {
        message.success(`消息已发送到 ${target}`);
      } else {
        message.warning(`消息发送失败：${target} 可能已断开`);
      }
    } catch (error) {
      message.error(`${getErrorMessage(error, '消息发送失败')}（目标 ${target}）`);
    } finally {
      setSendLoading(false);
    }
  };

  const handleBroadcast = async () => {
    const content = broadcastMessage.trim();
    if (!content) {
      message.warning('请先填写广播消息');
      return;
    }
    if (broadcastLoading) {
      return;
    }

    setBroadcastLoading(true);
    try {
      const res = await websocketApi.broadcast({ message: content });
      const result = (res.data?.data ?? {}) as { sent?: number; total?: number };
      message.success(`广播完成：成功送达 ${result.sent ?? 0} / ${result.total ?? 0} 个会话`);
    } catch (error) {
      message.error(getErrorMessage(error, '广播消息失败'));
    } finally {
      setBroadcastLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const keyword = sessionFilter.trim().toLowerCase();
    if (!keyword) {
      return sessions;
    }
    return sessions.filter((session) => {
      const haystack = [session.sessionId, session.deviceName, session.productKey, session.remoteAddress]
        .filter((item): item is string => Boolean(item))
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [sessions, sessionFilter]);

  const sessionOptions = sessions.map((session) => ({
    value: session.sessionId,
    label: `${session.sessionId} · ${session.deviceName || '未绑定设备'} · ${session.remoteAddress}`,
  }));
  if (sendSessionId && !sessions.some((item) => item.sessionId === sendSessionId)) {
    sessionOptions.unshift({
      value: sendSessionId,
      label: `${sendSessionId}（已不在在线列表，发送可能失败）`,
    });
  }

  const columns: ColumnsType<SessionInfo> = [
    {
      title: '会话 ID',
      dataIndex: 'sessionId',
      width: 200,
      render: (value: string) => (
        <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
      ),
    },
    {
      title: '设备上下文',
      width: 200,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.deviceName || '未绑定设备'}</Typography.Text>
          <Space size={6} wrap>
            {record.productKey ? <Tag color="processing">产品 {record.productKey}</Tag> : null}
            {record.deviceName ? <Tag color="green">设备已识别</Tag> : null}
          </Space>
        </Space>
      ),
    },
    {
      title: '远端地址',
      dataIndex: 'remoteAddress',
      width: 190,
      render: (value: string) => (
        <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
      ),
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
      render: (value: number) => (
        <Tag color={value > 0 ? 'processing' : 'default'}>{value}</Tag>
      ),
    },
    {
      title: '操作',
      width: 170,
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
          <Popconfirm
            title="确认断开该连接？"
            description="断开后设备需要重新建立 WebSocket 连接才能恢复通信，未发送的消息会丢失。"
            okText="断开"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={disconnectAction.pending}
            onConfirm={() => disconnectAction.run(() => handleDisconnect(record.sessionId))}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DisconnectOutlined />}
              disabled={disconnectAction.pending}
            >
              断开
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const broadcastExcerpt = broadcastMessage.trim().slice(0, 40);
  const broadcastTruncated = broadcastMessage.trim().length > 40;

  const refreshControls = (
    <Space size={8} wrap>
      <Space size={6}>
        <Typography.Text type="secondary">自动刷新</Typography.Text>
        <Switch
          size="small"
          checked={!paused}
          onChange={togglePaused}
          checkedChildren="开"
          unCheckedChildren="关"
        />
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        上次刷新 {formatClock(lastUpdatedAt)}
      </Typography.Text>
      <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
        刷新
      </Button>
    </Space>
  );

  return (
    <div>
      <PageHeader title="WebSocket 接入" />

      <ProtocolAccessGuide endpoint="/ws/device" />

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
                      <Statistic title="已识别设备" value={sessions.filter((item) => item.deviceName).length} prefix={<ApiOutlined />} />
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

                <Card style={cardStyle} extra={refreshControls}>
                  {loadError ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="WebSocket 会话加载失败，当前显示上次成功获取的数据"
                      description={<CopyText text={loadError} style={{ color: '#cf1322' }} />}
                      action={
                        <Button size="small" danger onClick={handleRefresh}>
                          重试
                        </Button>
                      }
                    />
                  ) : null}
                  <Space size={12} wrap style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="按会话 ID / 设备 / 产品标识 / 远端地址筛选"
                      value={sessionFilter}
                      onChange={(event) => setSessionFilter(event.target.value)}
                      style={{ width: 320 }}
                    />
                    <Typography.Text type="secondary">
                      共 {filteredSessions.length} / {sessions.length} 个会话
                    </Typography.Text>
                  </Space>
                  <Table<SessionInfo>
                    rowKey="sessionId"
                    columns={columns}
                    dataSource={filteredSessions}
                    loading={loading}
                    scroll={{ x: 1100 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{
                      emptyText: loadError && sessions.length === 0 ? (
                        <ListEmpty compact emptyText="WebSocket 会话加载失败，请点击上方“重试”" />
                      ) : (
                        <ListEmpty
                          hasFilters={Boolean(sessionFilter.trim())}
                          emptyText="暂无在线 WebSocket 会话，设备连接后会自动出现在这里"
                          filteredText="没有符合筛选条件的在线会话"
                          onClearFilters={() => setSessionFilter('')}
                          compact
                        />
                      ),
                    }}
                  />
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
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          目标会话
                        </Typography.Text>
                        <Select
                          showSearch
                          allowClear
                          value={sendSessionId || undefined}
                          onChange={(value) => setSendSessionId(value ?? '')}
                          placeholder={sessions.length ? '选择要发送的会话' : '当前无在线会话'}
                          optionFilterProp="label"
                          options={sessionOptions}
                          notFoundContent={sessions.length ? '没有匹配的会话' : '暂无在线会话'}
                          style={{ width: '100%' }}
                        />
                        {sendSessionId ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            发送目标：{getSessionLabel(sendSessionId)}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <Input.TextArea
                        rows={7}
                        value={sendMessage}
                        onChange={(event) => setSendMessage(event.target.value)}
                        placeholder='{"cmd":"readProperty","params":{"key":"temperature"}}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Space wrap>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={sendLoading}
                          disabled={!sendSessionId || !sendMessage.trim()}
                          onClick={() => void handleSend()}
                        >
                          发送消息
                        </Button>
                        {sendMessage.trim() ? (
                          <CopyText text={sendMessage}>
                            <span style={{ fontSize: 12 }}>复制消息</span>
                          </CopyText>
                        ) : null}
                      </Space>
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
                      <Popconfirm
                        title="确认广播 WebSocket 消息？"
                        description={(
                          <div style={{ maxWidth: 340 }}>
                            <div>
                              将向当前在线 <b>{sessionCount}</b> 个会话全量下发，所有连接都会收到该报文，操作不可撤销。
                            </div>
                            <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                              消息前 40 字符：<code>{broadcastExcerpt || '（空）'}</code>
                              {broadcastTruncated ? '…' : ''}
                            </div>
                          </div>
                        )}
                        okText="确认广播"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        disabled={!broadcastMessage.trim() || broadcastLoading}
                        onConfirm={() => handleBroadcast()}
                      >
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={broadcastLoading}
                          disabled={!broadcastMessage.trim()}
                        >
                          广播到 {sessionCount} 个在线会话
                        </Button>
                      </Popconfirm>
                      {broadcastMessage.trim() ? (
                        <CopyText text={broadcastMessage}>
                          <span style={{ fontSize: 12 }}>复制广播消息</span>
                        </CopyText>
                      ) : null}
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
