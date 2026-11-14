import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
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
  CloudServerOutlined,
  DisconnectOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  SwapOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { DeviceSelect, ProductSelect } from '../../components/EntitySelect';
import { deviceApi, productApi, tcpUdpApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { usePendingAction } from '../../hooks/usePendingAction';

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
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

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const IPV4_LIKE_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const formatClock = (value: Date | null) => (value ? dayjs(value).format('HH:mm:ss') : '--:--:--');

const formatDuration = (timestamp: number) => {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

/** UDP 目标可以是 IPv4 字面量，也可以是可解析的主机名。 */
const getUdpAddressError = (address: string): string | null => {
  if (!address) {
    return '请输入目标地址';
  }
  // 形如 IPv4 但每段越界的输入必须报错，不能被当作主机名放行。
  if (IPV4_LIKE_PATTERN.test(address) && !IPV4_PATTERN.test(address)) {
    return 'IPv4 地址格式不正确，每段必须是 0-255 之间的整数';
  }
  if (!IPV4_PATTERN.test(address) && !HOSTNAME_PATTERN.test(address)) {
    return '目标地址格式不正确，请输入 IPv4 地址或主机名，例如 192.168.1.10 或 plc.local';
  }
  return null;
};

const getUdpPortError = (port: number): string | null => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return '端口必须是 1-65535 之间的整数';
  }
  return null;
};

const TcpUdpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tcp');
  const [bindingForm] = Form.useForm<BindingFormValues>();

  const [tcpSessions, setTcpSessions] = useState<TcpSession[]>([]);
  const [tcpLoading, setTcpLoading] = useState(false);
  const [tcpCount, setTcpCount] = useState(0);
  const [tcpError, setTcpError] = useState<string | null>(null);
  const [tcpFilter, setTcpFilter] = useState('');

  const [udpPeers, setUdpPeers] = useState<UdpPeer[]>([]);
  const [udpLoading, setUdpLoading] = useState(false);
  const [udpStats, setUdpStats] = useState<{ peerCount: number; totalReceived: number }>({
    peerCount: 0,
    totalReceived: 0,
  });
  const [udpError, setUdpError] = useState<string | null>(null);
  const [udpFilter, setUdpFilter] = useState('');

  const [tcpSendSessionId, setTcpSendSessionId] = useState('');
  const [tcpSendMessage, setTcpSendMessage] = useState('');
  const [tcpSendLoading, setTcpSendLoading] = useState(false);
  const [tcpBroadcastMessage, setTcpBroadcastMessage] = useState('');
  const [tcpBroadcastLoading, setTcpBroadcastLoading] = useState(false);

  const [udpSendAddress, setUdpSendAddress] = useState('');
  const [udpSendPort, setUdpSendPort] = useState(8901);
  const [udpSendMessage, setUdpSendMessage] = useState('');
  const [udpSendLoading, setUdpSendLoading] = useState(false);

  const [productLabelMap, setProductLabelMap] = useState<Record<number, string>>({});
  const [bindingDeviceName, setBindingDeviceName] = useState<string | undefined>();
  const [bindingTarget, setBindingTarget] = useState<BindingTarget>(null);
  const [bindingSubmitting, setBindingSubmitting] = useState(false);

  const unbindTcpAction = usePendingAction();
  const disconnectTcpAction = usePendingAction();
  const unbindUdpAction = usePendingAction();

  // 设备下拉跟随表单里的产品联动，直接使用远程搜索组件按 productId 收敛候选。
  const selectedProductId = Form.useWatch('productId', bindingForm);
  const selectedDeviceId = Form.useWatch('deviceId', bindingForm);

  const productRequestRef = useRef<Set<number>>(new Set());

  // 会话/端点只保存 productId，列表展示产品名称需要按需补查，避免预加载全部产品。
  useEffect(() => {
    const missing = Array.from(new Set(
      [...tcpSessions, ...udpPeers]
        .map((item) => item.binding?.productId)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    )).filter((id) => !(id in productLabelMap) && !productRequestRef.current.has(id));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((id) => productRequestRef.current.add(id));
    void Promise.all(missing.map(async (id) => {
      try {
        const res = await productApi.get(id);
        const record = res.data.data as ProductOption | null;
        return record?.name ? { id, label: `${record.name} (${record.productKey})` } : null;
      } catch {
        productRequestRef.current.delete(id);
        return null;
      }
    })).then((records) => {
      const found = records.filter((item): item is { id: number; label: string } => item !== null);
      if (found.length === 0) {
        return;
      }
      setProductLabelMap((current) => {
        const next = { ...current };
        found.forEach((item) => {
          next[item.id] = item.label;
        });
        return next;
      });
    });
  }, [productLabelMap, tcpSessions, udpPeers]);

  const fetchTcp = useCallback(async () => {
    try {
      const [sessionRes, countRes] = await Promise.all([
        tcpUdpApi.listTcpSessions(),
        tcpUdpApi.tcpSessionCount(),
      ]);
      setTcpSessions(sessionRes.data?.data ?? []);
      setTcpCount(countRes.data?.data ?? 0);
      setTcpError(null);
    } catch (error) {
      // 失败时保留上一次的会话列表，避免把“请求失败”显示成“没有会话”。
      setTcpError(getErrorMessage(error, '加载 TCP 会话失败'));
    }
  }, []);

  const fetchUdp = useCallback(async () => {
    try {
      const [peerRes, statsRes] = await Promise.all([
        tcpUdpApi.listUdpPeers(),
        tcpUdpApi.udpStats(),
      ]);
      setUdpPeers(peerRes.data?.data ?? []);
      setUdpStats(statsRes.data?.data ?? { peerCount: 0, totalReceived: 0 });
      setUdpError(null);
    } catch (error) {
      setUdpError(getErrorMessage(error, '加载 UDP 端点失败'));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchTcp(), fetchUdp()]);
  }, [fetchTcp, fetchUdp]);

  // 会话/端点属于实时状态，10 秒轮询；用户可暂停，暂停后不再发起请求。
  const { paused, togglePaused, lastUpdatedAt, refresh } = useAutoRefresh(refreshAll, {
    intervalMs: 10000,
    immediate: false,
  });

  const handleManualRefresh = useCallback(() => {
    setTcpLoading(true);
    setUdpLoading(true);
    void refresh().finally(() => {
      setTcpLoading(false);
      setUdpLoading(false);
    });
  }, [refresh]);

  // 首屏由这里加载并计入“上次刷新”，轮询定时器不再重复触发首屏请求。
  useEffect(() => {
    let active = true;
    setTcpLoading(true);
    setUdpLoading(true);
    void refresh().finally(() => {
      if (!active) {
        return;
      }
      setTcpLoading(false);
      setUdpLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!bindingTarget) {
      bindingForm.resetFields();
      setBindingDeviceName(undefined);
      return;
    }

    setBindingDeviceName(bindingTarget.binding?.deviceName ?? undefined);
    bindingForm.setFieldsValue({
      productId: bindingTarget.binding?.productId ?? undefined,
      deviceId: bindingTarget.binding?.deviceId ?? undefined,
    });
  }, [bindingTarget, bindingForm]);

  const handleProductChange = () => {
    // 产品切换后清空设备，设备候选由 DeviceSelect 按新的 productId 远程搜索。
    bindingForm.setFieldValue('deviceId', undefined);
    setBindingDeviceName(undefined);
  };

  const deviceDetailRequestRef = useRef(0);

  const handleDeviceChange = async (deviceId?: number) => {
    const requestId = deviceDetailRequestRef.current + 1;
    deviceDetailRequestRef.current = requestId;
    if (!deviceId) {
      setBindingDeviceName(undefined);
      return;
    }
    try {
      const res = await deviceApi.get(deviceId);
      const record = res.data.data as { deviceName?: string } | null;
      if (requestId === deviceDetailRequestRef.current) {
        setBindingDeviceName(record?.deviceName);
      }
    } catch {
      if (requestId === deviceDetailRequestRef.current) {
        // 设备名称仅用于绑定展示，补查失败时 deviceId 仍会正常提交。
        setBindingDeviceName(undefined);
      }
    }
  };

  const buildBindingPayload = (values: BindingFormValues, deviceName?: string) => {
    const payload: Record<string, unknown> = {
      productId: Number(values.productId),
    };

    if (typeof values.deviceId === 'number') {
      payload.deviceId = values.deviceId;
      payload.deviceName = deviceName || undefined;
    }
    return payload;
  };

  const handleBind = async () => {
    if (!bindingTarget || bindingSubmitting) {
      return;
    }

    setBindingSubmitting(true);
    try {
      const values = await bindingForm.validateFields();
      // 设备名称可能是异步补查的；提交前兜底补一次，避免网络慢时丢失 deviceName。
      let deviceName = bindingDeviceName;
      if (typeof values.deviceId === 'number' && !deviceName) {
        try {
          const res = await deviceApi.get(values.deviceId);
          deviceName = (res.data.data as { deviceName?: string } | null)?.deviceName;
        } catch {
          // 名称仅用于绑定展示，补查失败不影响 deviceId 提交。
        }
      }
      const payload = buildBindingPayload(values, deviceName);

      if (bindingTarget.type === 'tcp') {
        await tcpUdpApi.bindTcpSession(bindingTarget.sessionId, payload);
        message.success(`TCP 会话 ${bindingTarget.sessionId} 绑定成功`);
        await fetchTcp();
      } else {
        await tcpUdpApi.bindUdpPeer({
          ...payload,
          address: bindingTarget.address,
          port: bindingTarget.port,
        });
        message.success(`UDP 端点 ${bindingTarget.address}:${bindingTarget.port} 绑定成功`);
        await fetchUdp();
      }

      setBindingTarget(null);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '绑定设备上下文失败'));
    } finally {
      setBindingSubmitting(false);
    }
  };

  const handleUnbindTcp = async (sessionId: string) => {
    try {
      await tcpUdpApi.unbindTcpSession(sessionId);
    } catch (error) {
      message.error(getErrorMessage(error, `TCP 会话 ${sessionId} 解绑失败`));
      return;
    }
    message.success(`TCP 会话 ${sessionId} 已解绑`);
    await fetchTcp();
  };

  const handleUnbindUdp = async (address: string, port: number) => {
    try {
      await tcpUdpApi.unbindUdpPeer(address, port);
    } catch (error) {
      message.error(getErrorMessage(error, `UDP 端点 ${address}:${port} 解绑失败`));
      return;
    }
    message.success(`UDP 端点 ${address}:${port} 已解绑`);
    await fetchUdp();
  };

  const handleDisconnectTcp = async (sessionId: string) => {
    try {
      await tcpUdpApi.disconnectTcp(sessionId);
    } catch (error) {
      message.error(getErrorMessage(error, `断开 TCP 会话 ${sessionId} 失败`));
      return;
    }
    message.success(`TCP 会话 ${sessionId} 已断开`);
    await fetchTcp();
  };

  const getSessionTargetLabel = (sessionId: string) => {
    const session = tcpSessions.find((item) => item.sessionId === sessionId);
    return session?.remoteAddress ? `${sessionId}（${session.remoteAddress}）` : sessionId;
  };

  const handleSendTcp = async () => {
    const sessionId = tcpSendSessionId.trim();
    const content = tcpSendMessage.trim();
    if (!sessionId || !content) {
      message.warning('请选择目标会话并填写消息内容');
      return;
    }
    if (tcpSendLoading) {
      return;
    }

    setTcpSendLoading(true);
    const target = getSessionTargetLabel(sessionId);
    try {
      const res = await tcpUdpApi.sendTcp({ sessionId, message: content });
      if (res.data?.data) {
        message.success(`TCP 消息已发送到 ${target}`);
      } else {
        message.warning(`TCP 消息发送失败：${target} 可能已断开`);
      }
    } catch (error) {
      message.error(`${getErrorMessage(error, 'TCP 消息发送失败')}（目标 ${target}）`);
    } finally {
      setTcpSendLoading(false);
    }
  };

  const handleBroadcastTcp = async () => {
    const content = tcpBroadcastMessage.trim();
    if (!content) {
      message.warning('请先填写广播消息');
      return;
    }
    if (tcpBroadcastLoading) {
      return;
    }

    setTcpBroadcastLoading(true);
    try {
      const res = await tcpUdpApi.broadcastTcp({ message: content });
      const result = (res.data?.data ?? {}) as { sent?: number; total?: number };
      message.success(`TCP 广播完成：成功送达 ${result.sent ?? 0} / ${result.total ?? 0} 个会话`);
    } catch (error) {
      message.error(getErrorMessage(error, 'TCP 广播失败'));
    } finally {
      setTcpBroadcastLoading(false);
    }
  };

  const handleSendUdp = () => {
    const addressError = getUdpAddressError(udpSendAddress.trim());
    if (addressError) {
      message.warning(addressError);
      return;
    }
    const portError = getUdpPortError(udpSendPort);
    if (portError) {
      message.warning(portError);
      return;
    }
    const content = udpSendMessage.trim();
    if (!content) {
      message.warning('请输入 UDP 消息内容');
      return;
    }
    if (udpSendLoading) {
      return;
    }

    const address = udpSendAddress.trim();
    const target = `${address}:${udpSendPort}`;
    const excerpt = content.length > 40 ? `${content.slice(0, 40)}…` : content;

    // 目标地址是自由输入，发送前必须让用户再次确认实际目标与报文摘要。
    Modal.confirm({
      title: '确认发送 UDP 消息？',
      content: (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <span>目标：<code>{target}</code></span>
          <span style={{ wordBreak: 'break-all' }}>消息摘要：<code>{excerpt}</code></span>
        </Space>
      ),
      okText: '发送',
      cancelText: '取消',
      onOk: async () => {
        setUdpSendLoading(true);
        try {
          const res = await tcpUdpApi.sendUdp({ address, port: udpSendPort, message: content });
          if (res.data?.data) {
            message.success(`UDP 消息已发送到 ${target}`);
          } else {
            message.warning(`UDP 消息发送失败（目标 ${target}）`);
          }
        } catch (error) {
          message.error(`${getErrorMessage(error, 'UDP 消息发送失败')}（目标 ${target}）`);
        } finally {
          setUdpSendLoading(false);
        }
      },
    });
  };

  const getBindingDeviceLabel = (binding?: TcpUdpBinding | null) => {
    if (!binding) {
      return '';
    }
    return binding.deviceName || '';
  };

  const renderBinding = (binding?: TcpUdpBinding | null) => {
    if (!binding?.productId) {
      return <Tag>未绑定</Tag>;
    }

    const productName = productLabelMap[binding.productId] || binding.productKey || '未知产品';

    return (
      <Space direction="vertical" size={2}>
        <Typography.Text strong>{productName}</Typography.Text>
        <Space size={6} wrap>
          {binding.productKey ? <Tag color="processing">{binding.productKey}</Tag> : null}
          {binding.deviceName ? <Tag color="green">{binding.deviceName}</Tag> : null}
        </Space>
        {binding.bindTime ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            绑定于 {formatDateTime(binding.bindTime)}
          </Typography.Text>
        ) : null}
      </Space>
    );
  };

  const filteredTcpSessions = useMemo(() => {
    const keyword = tcpFilter.trim().toLowerCase();
    if (!keyword) {
      return tcpSessions;
    }
    return tcpSessions.filter((session) => {
      const binding = session.binding;
      const productName = binding?.productId ? productLabelMap[binding.productId] : undefined;
      const haystack = [
        session.sessionId,
        session.remoteAddress,
        binding?.productKey,
        productName,
        binding?.deviceName,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [tcpSessions, tcpFilter, productLabelMap]);

  const filteredUdpPeers = useMemo(() => {
    const keyword = udpFilter.trim().toLowerCase();
    if (!keyword) {
      return udpPeers;
    }
    return udpPeers.filter((peer) => {
      const binding = peer.binding;
      const productName = binding?.productId ? productLabelMap[binding.productId] : undefined;
      const haystack = [
        peer.address,
        String(peer.port),
        binding?.productKey,
        productName,
        binding?.deviceName,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [udpPeers, udpFilter, productLabelMap]);

  const sessionOptions = tcpSessions.map((session) => {
    const deviceLabel = getBindingDeviceLabel(session.binding);
    return {
      value: session.sessionId,
      label: `${session.sessionId} · ${deviceLabel || '未绑定设备'} · ${session.remoteAddress}`,
    };
  });
  if (tcpSendSessionId && !tcpSessions.some((item) => item.sessionId === tcpSendSessionId)) {
    sessionOptions.unshift({
      value: tcpSendSessionId,
      label: `${tcpSendSessionId}（已不在在线列表，发送可能失败）`,
    });
  }

  const boundProductId = bindingTarget?.binding?.productId;
  const boundProductLabel = boundProductId
    ? (productLabelMap[boundProductId] || bindingTarget?.binding?.productKey || undefined)
    : undefined;

  const renderRefreshControls = () => (
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
      <Button
        icon={<ReloadOutlined />}
        onClick={handleManualRefresh}
        loading={tcpLoading || udpLoading}
      >
        刷新
      </Button>
    </Space>
  );

  const tcpColumns: ColumnsType<TcpSession> = [
    {
      title: '会话 ID',
      dataIndex: 'sessionId',
      width: 200,
      render: (value: string) => (
        <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
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
      render: (value: number) =>
        value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-',
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
      width: 240,
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
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => setBindingTarget({
              type: 'tcp',
              sessionId: record.sessionId,
              remoteAddress: record.remoteAddress,
              binding: record.binding,
            })}
          >
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm
              title="确认解绑该 TCP 会话？"
              description="解绑后该会话上报的数据将不再归属当前产品/设备，需要重新绑定才能恢复归属。"
              okText="解绑"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={unbindTcpAction.pending}
              onConfirm={() => unbindTcpAction.run(() => handleUnbindTcp(record.sessionId))}
            >
              <Button type="link" size="small" danger disabled={unbindTcpAction.pending}>
                解绑
              </Button>
            </Popconfirm>
          ) : null}
          <Popconfirm
            title="确认断开该 TCP 连接？"
            description="断开后设备需要重新建立连接才能恢复通信，未发送的数据会丢失。"
            okText="断开"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={disconnectTcpAction.pending}
            onConfirm={() => disconnectTcpAction.run(() => handleDisconnectTcp(record.sessionId))}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DisconnectOutlined />}
              disabled={disconnectTcpAction.pending}
            >
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
      width: 190,
      render: (value: string) => (
        <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
      ),
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
      render: (value: number) => (
        <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip>
      ),
    },
    {
      title: '最后消息',
      dataIndex: 'lastMessageTime',
      width: 120,
      render: (value: number) =>
        value ? <Tooltip title={formatDateTime(value)}>{formatDuration(value)}前</Tooltip> : '-',
    },
    {
      title: '接收数',
      dataIndex: 'receivedCount',
      width: 100,
      render: (value: number) => (
        <Tag color={value > 0 ? 'processing' : 'default'}>{value}</Tag>
      ),
    },
    {
      title: '操作',
      width: 190,
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
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => setBindingTarget({
              type: 'udp',
              address: record.address,
              port: record.port,
              binding: record.binding,
            })}
          >
            {record.binding?.productId ? '重绑' : '绑定'}
          </Button>
          {record.binding?.productId ? (
            <Popconfirm
              title="确认解绑该 UDP 端点？"
              description="解绑后该端点上报的数据将不再归属当前产品/设备，需要重新绑定才能恢复归属。"
              okText="解绑"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={unbindUdpAction.pending}
              onConfirm={() => unbindUdpAction.run(() => handleUnbindUdp(record.address, record.port))}
            >
              <Button type="link" size="small" danger disabled={unbindUdpAction.pending}>
                解绑
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const tcpBoundCount = tcpSessions.filter((item) => item.binding?.productId).length;
  const udpBoundCount = udpPeers.filter((item) => item.binding?.productId).length;
  const tcpBroadcastExcerpt = tcpBroadcastMessage.trim().slice(0, 40);
  const tcpBroadcastTruncated = tcpBroadcastMessage.trim().length > 40;

  return (
    <div>
      <PageHeader title="TCP/UDP 原始 Socket 接入" />

      <ProtocolAccessGuide />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {renderRefreshControls()}
      </div>

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
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="TCP 在线连接" value={tcpCount} prefix={<WifiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="已绑定上下文" value={tcpBoundCount} prefix={<ApiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="TCP 端口" value={8900} prefix={<CloudServerOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="解码入口" value="协议解析" valueStyle={{ fontSize: 16 }} />
                    </Card>
                  </Col>
                </Row>

                <Card style={cardStyle}>
                  {tcpError ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="TCP 会话加载失败，当前显示上次成功获取的数据"
                      description={<CopyText text={tcpError} style={{ color: '#cf1322' }} />}
                      action={
                        <Button size="small" danger onClick={handleManualRefresh}>
                          重试
                        </Button>
                      }
                    />
                  ) : null}
                  <Space size={12} wrap style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="按会话 ID / 远端地址 / 设备筛选"
                      value={tcpFilter}
                      onChange={(event) => setTcpFilter(event.target.value)}
                      style={{ width: 320 }}
                    />
                    <Typography.Text type="secondary">
                      共 {filteredTcpSessions.length} / {tcpSessions.length} 个会话
                    </Typography.Text>
                  </Space>
                  <Table<TcpSession>
                    rowKey="sessionId"
                    columns={tcpColumns}
                    dataSource={filteredTcpSessions}
                    loading={tcpLoading}
                    scroll={{ x: 1320 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{
                      emptyText: tcpError && tcpSessions.length === 0 ? (
                        <ListEmpty compact emptyText="TCP 会话加载失败，请点击上方“重试”" />
                      ) : (
                        <ListEmpty
                          hasFilters={Boolean(tcpFilter.trim())}
                          emptyText="暂无 TCP 会话，设备连接后会自动出现在这里"
                          filteredText="没有符合筛选条件的 TCP 会话"
                          onClearFilters={() => setTcpFilter('')}
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
            key: 'udp',
            label: 'UDP 端点',
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="UDP 端点数" value={udpStats.peerCount} prefix={<SwapOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="已绑定上下文" value={udpBoundCount} prefix={<ApiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="累计接收报文" value={udpStats.totalReceived} prefix={<SendOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="UDP 端口" value={8901} prefix={<CloudServerOutlined />} />
                    </Card>
                  </Col>
                </Row>

                <Card style={cardStyle}>
                  {udpError ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="UDP 端点加载失败，当前显示上次成功获取的数据"
                      description={<CopyText text={udpError} style={{ color: '#cf1322' }} />}
                      action={
                        <Button size="small" danger onClick={handleManualRefresh}>
                          重试
                        </Button>
                      }
                    />
                  ) : null}
                  <Space size={12} wrap style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="按地址 / 端口 / 设备筛选"
                      value={udpFilter}
                      onChange={(event) => setUdpFilter(event.target.value)}
                      style={{ width: 320 }}
                    />
                    <Typography.Text type="secondary">
                      共 {filteredUdpPeers.length} / {udpPeers.length} 个端点
                    </Typography.Text>
                  </Space>
                  <Table<UdpPeer>
                    rowKey={(record) => `${record.address}:${record.port}`}
                    columns={udpColumns}
                    dataSource={filteredUdpPeers}
                    loading={udpLoading}
                    scroll={{ x: 1220 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{
                      emptyText: udpError && udpPeers.length === 0 ? (
                        <ListEmpty compact emptyText="UDP 端点加载失败，请点击上方“重试”" />
                      ) : (
                        <ListEmpty
                          hasFilters={Boolean(udpFilter.trim())}
                          emptyText="暂无 UDP 端点，收到报文后会自动出现在这里"
                          filteredText="没有符合筛选条件的 UDP 端点"
                          onClearFilters={() => setUdpFilter('')}
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
            key: 'tools',
            label: '消息调试',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={8}>
                  <Card title={<Space><SendOutlined />发送 TCP</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          目标会话
                        </Typography.Text>
                        <Select
                          showSearch
                          allowClear
                          value={tcpSendSessionId || undefined}
                          onChange={(value) => setTcpSendSessionId(value ?? '')}
                          placeholder={tcpSessions.length ? '选择要发送的 TCP 会话' : '当前无在线 TCP 会话'}
                          optionFilterProp="label"
                          options={sessionOptions}
                          notFoundContent={tcpSessions.length ? '没有匹配的会话' : '暂无在线会话'}
                          style={{ width: '100%' }}
                        />
                        {tcpSendSessionId ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            发送目标：{getSessionTargetLabel(tcpSendSessionId)}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <Input.TextArea
                        rows={6}
                        value={tcpSendMessage}
                        onChange={(event) => setTcpSendMessage(event.target.value)}
                        placeholder='{"temperature":25.5}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Space wrap>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={tcpSendLoading}
                          disabled={!tcpSendSessionId || !tcpSendMessage.trim()}
                          onClick={() => void handleSendTcp()}
                        >
                          发送 TCP 消息
                        </Button>
                        {tcpSendMessage.trim() ? (
                          <CopyText text={tcpSendMessage}>
                            <span style={{ fontSize: 12 }}>复制消息</span>
                          </CopyText>
                        ) : null}
                      </Space>
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
                      <Popconfirm
                        title="确认广播 TCP 消息？"
                        description={(
                          <div style={{ maxWidth: 340 }}>
                            <div>
                              将向当前在线 <b>{tcpCount}</b> 个 TCP 会话全量下发，所有连接都会收到该报文，操作不可撤销。
                            </div>
                            <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                              消息前 40 字符：<code>{tcpBroadcastExcerpt || '（空）'}</code>
                              {tcpBroadcastTruncated ? '…' : ''}
                            </div>
                          </div>
                        )}
                        okText="确认广播"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        disabled={!tcpBroadcastMessage.trim() || tcpBroadcastLoading}
                        onConfirm={() => handleBroadcastTcp()}
                      >
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={tcpBroadcastLoading}
                          disabled={!tcpBroadcastMessage.trim()}
                        >
                          广播到 {tcpCount} 个 TCP 会话
                        </Button>
                      </Popconfirm>
                      {tcpBroadcastMessage.trim() ? (
                        <CopyText text={tcpBroadcastMessage}>
                          <span style={{ fontSize: 12 }}>复制广播消息</span>
                        </CopyText>
                      ) : null}
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
                        placeholder="IPv4 或主机名，例如 192.168.1.10 / plc.local"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <InputNumber
                        min={1}
                        max={65535}
                        precision={0}
                        style={{ width: '100%' }}
                        addonBefore="Port"
                        value={udpSendPort || undefined}
                        placeholder="1-65535"
                        onChange={(value) => setUdpSendPort(typeof value === 'number' ? value : 0)}
                      />
                      <Input.TextArea
                        rows={5}
                        value={udpSendMessage}
                        onChange={(event) => setUdpSendMessage(event.target.value)}
                        placeholder='{"temperature":25.5}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Space wrap>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={udpSendLoading}
                          disabled={!udpSendAddress.trim() || !udpSendMessage.trim()}
                          onClick={handleSendUdp}
                        >
                          发送 UDP 消息
                        </Button>
                        {udpSendMessage.trim() ? (
                          <CopyText text={udpSendMessage}>
                            <span style={{ fontSize: 12 }}>复制消息</span>
                          </CopyText>
                        ) : null}
                      </Space>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        发送前会再次确认目标地址与端口；端口范围 1-65535。
                      </Typography.Text>
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
        okText="保存绑定"
        cancelText="取消"
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="绑定后该会话上报的数据将归属所选产品/设备；重新绑定会替换原有归属。"
        />
        {bindingTarget ? (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">当前目标</Typography.Text>
              <Space wrap>
                <Tag color="processing">
                  {bindingTarget.type === 'tcp' ? 'TCP 会话' : 'UDP 端点'}
                </Tag>
                {bindingTarget.type === 'tcp' ? (
                  <>
                    <CopyText text={bindingTarget.sessionId} style={{ fontFamily: 'monospace' }} />
                    <CopyText text={bindingTarget.remoteAddress} style={{ fontFamily: 'monospace' }} />
                  </>
                ) : (
                  <CopyText
                    text={`${bindingTarget.address}:${bindingTarget.port}`}
                    style={{ fontFamily: 'monospace' }}
                  />
                )}
              </Space>
            </Space>
          </Card>
        ) : null}
        <Form form={bindingForm} layout="vertical">
          <Form.Item
            name="productId"
            label="关联产品"
            rules={[{ required: true, message: '请选择产品' }]}
          >
            <ProductSelect
              placeholder="搜索并选择产品（名称或 productKey）"
              pinnedLabel={selectedProductId === boundProductId ? boundProductLabel : undefined}
              onChange={handleProductChange}
            />
          </Form.Item>
          <Form.Item name="deviceId" label="关联设备">
            <DeviceSelect
              key={selectedProductId ?? 'all'}
              productId={selectedProductId}
              placeholder={selectedProductId ? '搜索并选择设备（名称或别名）' : '可先选择产品后再选设备'}
              pinnedLabel={selectedDeviceId === bindingTarget?.binding?.deviceId ? bindingDeviceName : undefined}
              onChange={(value) => void handleDeviceChange(value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TcpUdpPage;
