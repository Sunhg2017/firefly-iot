import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Modal,
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
  CloudServerOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  SignalFilled,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { loraWanApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

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

const formatClock = (value: Date | null) => (value ? dayjs(value).format('HH:mm:ss') : '--:--:--');

const formatDuration = (timestamp: number) => {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const LoRaWanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('devices');
  const [devices, setDevices] = useState<LoRaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LoRaStats | null>(null);
  const [config, setConfig] = useState<LoRaConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [devEui, setDevEui] = useState('');
  const [fPort, setFPort] = useState(1);
  const [payload, setPayload] = useState('');
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [deviceRes, statsRes, configRes] = await Promise.all([
        loraWanApi.listDevices(),
        loraWanApi.stats(),
        loraWanApi.config(),
      ]);
      setDevices(deviceRes.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
      setConfig(configRes.data?.data ?? null);
      setLoadError(null);
    } catch (error) {
      // 保留上一次的设备/统计/配置，避免请求失败被误认为“没有设备”。
      setLoadError(getErrorMessage(error, '加载 LoRaWAN 数据失败'));
    }
  }, []);

  // 设备状态会随上行/入网事件变化，15 秒自动刷新；可暂停。
  const { paused, togglePaused, lastUpdatedAt, refresh } = useAutoRefresh(fetchAll, {
    intervalMs: 15000,
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

  const handleDownlink = (device: LoRaDevice | undefined) => {
    const targetDevEui = devEui.trim();
    if (!targetDevEui) {
      message.warning('请选择目标 DevEUI');
      return;
    }
    if (!Number.isInteger(fPort) || fPort < 1 || fPort > 255) {
      message.warning('fPort 必须是 1-255 之间的整数');
      return;
    }
    const content = payload.trim();
    if (!content) {
      message.warning('请输入下行 payload');
      return;
    }
    if (sending) {
      return;
    }

    const targetLabel = device?.deviceName ? `${targetDevEui}（${device.deviceName}）` : targetDevEui;
    const excerpt = content.length > 80 ? `${content.slice(0, 80)}…` : content;

    // 下行会真实占用网络服务器队列，发送前必须确认目标与 payload。
    Modal.confirm({
      title: '确认发送 LoRaWAN 下行？',
      content: (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <span>目标设备：<code>{targetLabel}</code></span>
          <span>fPort：<code>{fPort}</code></span>
          <span style={{ wordBreak: 'break-all' }}>payload：<code>{excerpt}</code></span>
          {content.length > 80 ? <CopyText text={content}><span style={{ fontSize: 12 }}>复制完整 payload</span></CopyText> : null}
        </Space>
      ),
      okText: '发送下行',
      cancelText: '取消',
      onOk: async () => {
        setSending(true);
        try {
          const res = await loraWanApi.sendDownlink({
            devEui: targetDevEui,
            fPort,
            data: content,
          });
          if (res.data?.data) {
            message.success(`下行任务已提交：${targetLabel}`);
          } else {
            message.warning(`下行任务提交失败：${targetLabel}`);
          }
        } catch (error) {
          message.error(`${getErrorMessage(error, '发送下行失败')}（目标 ${targetLabel}）`);
        } finally {
          setSending(false);
        }
      },
    });
  };

  const filteredDevices = useMemo(() => {
    const keyword = deviceFilter.trim().toLowerCase();
    if (!keyword) {
      return devices;
    }
    return devices.filter((device) => {
      const haystack = [
        device.devEui,
        device.deviceName,
        device.applicationName,
        device.applicationId,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [devices, deviceFilter]);

  const selectedDevice = devices.find((item) => item.devEui === devEui);

  const deviceOptions = devices.map((device) => ({
    value: device.devEui,
    label: `${device.devEui} · ${device.deviceName || '未命名设备'}`,
  }));
  if (devEui && !devices.some((item) => item.devEui === devEui)) {
    deviceOptions.unshift({
      value: devEui,
      label: `${devEui}（已不在设备列表，下行可能失败）`,
    });
  }

  const columns: ColumnsType<LoRaDevice> = [
    {
      title: 'DevEUI',
      dataIndex: 'devEui',
      width: 200,
      render: (value: string) => (
        <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
      ),
    },
    {
      title: '设备',
      width: 200,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <span style={{ fontWeight: 600 }}>{record.deviceName || '未命名设备'}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            {record.applicationName || record.applicationId || '未关联应用'}
          </span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'joined',
      width: 100,
      render: (value: boolean) => (value ? <Tag color="success">已入网</Tag> : <Tag>未入网</Tag>),
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
      width: 170,
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
      width: 180,
      render: (value: number) => (
        value ? (
          <Tooltip title={`${formatDuration(value)}前`}>
            <span>{formatDateTime(value)}</span>
          </Tooltip>
        ) : '-'
      ),
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
      <PageHeader title="LoRaWAN 接入" />

      <ProtocolAccessGuide />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="LoRaWAN 数据加载失败，当前显示上次成功获取的数据"
          description={<CopyText text={loadError} style={{ color: '#cf1322' }} />}
          action={
            <Button size="small" danger onClick={handleRefresh}>
              重试
            </Button>
          }
        />
      ) : null}

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
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="设备数" value={stats?.deviceCount || 0} prefix={<WifiOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="累计上行" value={stats?.totalUplinks || 0} prefix={<SignalFilled />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic title="累计下行" value={stats?.totalDownlinks || 0} prefix={<SendOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={cardStyle}>
                      <Statistic
                        title="网络服务器"
                        value={stats?.networkServer || '-'}
                        prefix={<CloudServerOutlined />}
                        valueStyle={{ fontSize: 16 }}
                      />
                    </Card>
                  </Col>
                </Row>

                <Card style={cardStyle} extra={refreshControls}>
                  <Space size={12} wrap style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="按 DevEUI / 设备名 / 应用筛选"
                      value={deviceFilter}
                      onChange={(event) => setDeviceFilter(event.target.value)}
                      style={{ width: 320 }}
                    />
                    <Typography.Text type="secondary">
                      共 {filteredDevices.length} / {devices.length} 台设备
                    </Typography.Text>
                  </Space>
                  <Table<LoRaDevice>
                    rowKey="devEui"
                    columns={columns}
                    dataSource={filteredDevices}
                    loading={loading}
                    scroll={{ x: 1180 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{
                      emptyText: loadError && devices.length === 0 ? (
                        <ListEmpty compact emptyText="LoRaWAN 设备加载失败，请点击上方“重试”" />
                      ) : (
                        <ListEmpty
                          hasFilters={Boolean(deviceFilter.trim())}
                          emptyText="暂无 LoRaWAN 设备，收到上行或入网事件后会自动出现在这里"
                          filteredText="没有符合筛选条件的 LoRaWAN 设备"
                          onClearFilters={() => setDeviceFilter('')}
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
            key: 'downlink',
            label: '下行消息',
            children: (
              <Row gutter={16}>
                <Col xs={24} xl={12}>
                  <Card title={<Space><SendOutlined />发送下行</Space>} style={cardStyle}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          目标设备
                        </Typography.Text>
                        <Select
                          showSearch
                          allowClear
                          value={devEui || undefined}
                          onChange={(value) => setDevEui(value ?? '')}
                          placeholder={devices.length ? '选择要下发指令的 DevEUI' : '当前无已知 LoRaWAN 设备'}
                          optionFilterProp="label"
                          options={deviceOptions}
                          notFoundContent={devices.length ? '没有匹配的设备' : '暂无已知设备'}
                          style={{ width: '100%' }}
                        />
                      </div>

                      {selectedDevice ? (
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="设备名称">
                            {selectedDevice.deviceName || '未命名设备'}
                          </Descriptions.Item>
                          <Descriptions.Item label="所属应用">
                            {selectedDevice.applicationName || selectedDevice.applicationId || '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="入网状态">
                            {selectedDevice.joined
                              ? <Tag color="success">已入网</Tag>
                              : <Tag>未入网</Tag>}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近上行">
                            {selectedDevice.lastUplinkTime
                              ? formatDateTime(selectedDevice.lastUplinkTime)
                              : '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="链路质量">
                            RSSI {selectedDevice.lastRssi} dBm / SNR {selectedDevice.lastSnr?.toFixed(1)} dB
                          </Descriptions.Item>
                        </Descriptions>
                      ) : null}

                      <InputNumber
                        min={1}
                        max={255}
                        precision={0}
                        style={{ width: '100%' }}
                        addonBefore="fPort"
                        value={fPort || undefined}
                        placeholder="1-255"
                        onChange={(value) => setFPort(typeof value === 'number' ? value : 0)}
                      />
                      <Input.TextArea
                        rows={6}
                        value={payload}
                        onChange={(event) => setPayload(event.target.value)}
                        placeholder='Base64 数据或 JSON 负载，例如 {"led":true}'
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Space wrap>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          loading={sending}
                          disabled={!devEui || !payload.trim()}
                          onClick={() => handleDownlink(selectedDevice)}
                        >
                          发送下行
                        </Button>
                        {payload.trim() ? (
                          <CopyText text={payload}>
                            <span style={{ fontSize: 12 }}>复制 payload</span>
                          </CopyText>
                        ) : null}
                      </Space>
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
                    <Tag color={config.enabled ? 'success' : 'default'}>
                      {config.enabled ? '已启用' : '未启用'}
                    </Tag>
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
              <Card style={cardStyle}>
                <ListEmpty
                  emptyText={loadError ? 'LoRaWAN 接入配置加载失败，请点击上方重试' : '暂无 LoRaWAN 接入配置'}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default LoRaWanPage;
