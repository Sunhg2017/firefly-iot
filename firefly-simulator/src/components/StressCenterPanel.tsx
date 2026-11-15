import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Divider, Empty, Form, Input, InputNumber,
  Modal, Progress, Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
  message,
} from 'antd';
import {
  DownloadOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined,
  ReloadOutlined, StopOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useSimStore, type SimDevice } from '../store';
import {
  DEFAULT_LOAD_CONFIG, LOAD_PROTOCOLS, PROTOCOL_SUPPORT_NOTES, LoadRunner,
  type LoadConfig, type LoadProtocol, type LoadSnapshot,
} from '../utils/loadEngine';
import { connectDevices } from '../utils/fleetOps';
import BulkCreateDevicesDrawer from './BulkCreateDevicesDrawer';

const { Text, Title } = Typography;

interface StressCenterPanelProps {
  seedDeviceIds?: string[];
}

interface HistoryEntry {
  id: string;
  at: number;
  config: LoadConfig;
  deviceCount: number;
  snapshot: LoadSnapshot;
}

const EMPTY_SNAPSHOT: LoadSnapshot = {
  running: false, paused: false, done: false, total: 0, sent: 0, success: 0, failed: 0,
  inFlight: 0, elapsedMs: 0, tps: 0, successRate: 0, avgLatency: 0, p50: 0, p90: 0, p95: 0,
  p99: 0, maxLatency: 0, byProtocol: {}, errors: [], timeline: [],
};

const PROTOCOL_COLORS: Record<string, string> = {
  HTTP: 'blue', MQTT: 'green', CoAP: 'orange', WebSocket: 'volcano', TCP: 'magenta',
  UDP: 'lime', LoRaWAN: 'gold', SNMP: 'cyan', Modbus: 'geekblue',
};

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0s';
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function MiniSparkline({ values, color = '#2563eb' }: { values: number[]; color?: string }) {
  if (values.length === 0) {
    return <div style={{ height: 56, display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: 12 }}>等待压测数据</div>;
  }
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 56 - (value / max) * 48 - 4;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ width: '100%', height: 56 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StressCenterPanel({ seedDeviceIds }: StressCenterPanelProps) {
  const devices = useSimStore((state) => state.devices);
  const templates = useSimStore((state) => state.templates);
  const addLog = useSimStore((state) => state.addLog);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [config, setConfig] = useState<LoadConfig>(DEFAULT_LOAD_CONFIG);
  const [snapshot, setSnapshot] = useState<LoadSnapshot>(EMPTY_SNAPSHOT);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [autoConnect, setAutoConnect] = useState(true);
  const [connectConcurrency, setConnectConcurrency] = useState(10);
  const [starting, setStarting] = useState(false);
  const [connectProgress, setConnectProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const runnerRef = useRef<LoadRunner | null>(null);
  const seedAppliedRef = useRef<string>('');

  useEffect(() => {
    if (!seedDeviceIds || seedDeviceIds.length === 0) {
      return;
    }
    const seedKey = seedDeviceIds.join(',');
    if (seedAppliedRef.current === seedKey) {
      return;
    }
    seedAppliedRef.current = seedKey;
    // 视频设备不参与批量压测，入口传入时直接过滤，避免 Select 显示无效 id。
    const latestDevices = useSimStore.getState().devices;
    const loadableIds = seedDeviceIds.filter((id) => {
      const device = latestDevices.find((item) => item.id === id);
      return device && LOAD_PROTOCOLS.includes(device.protocol as LoadProtocol);
    });
    setSelectedIds(loadableIds);
  }, [seedDeviceIds]);

  const selectedDevices = useMemo(
    () => devices.filter((device) => selectedIds.includes(device.id)),
    [devices, selectedIds],
  );
  const protocolGroups = useMemo(() => LOAD_PROTOCOLS.map((protocol) => ({
    label: protocol,
    options: devices
      .filter((device) => device.protocol === protocol)
      .map((device) => ({
        value: device.id,
        label: `${device.name} · ${device.deviceName || device.protocol} · ${device.status === 'online' ? '在线' : '离线'}`,
      })),
  })).filter((group) => group.options.length > 0), [devices]);
  const selectedProtocols = useMemo(
    () => Array.from(new Set(selectedDevices.map((device) => device.protocol as LoadProtocol)))
      .filter((protocol): protocol is LoadProtocol => LOAD_PROTOCOLS.includes(protocol)),
    [selectedDevices],
  );
  const onlineSelected = selectedDevices.filter((device) => device.status === 'online').length;
  const unsupportedSelected = selectedDevices.filter((device) => !LOAD_PROTOCOLS.includes(device.protocol as LoadProtocol));

  useEffect(() => {
    return () => {
      runnerRef.current?.stop();
    };
  }, []);

  const updateConfig = (patch: Partial<LoadConfig>) => {
    setConfig((previous) => ({ ...previous, ...patch }));
  };

  const startWithoutConnect = () => {
    // 连接动作会更新 store 中的 token/状态，必须读最新设备快照，避免用连接前的空 token 发请求。
    const currentDevices = useSimStore.getState().devices.filter((device) => selectedIds.includes(device.id));
    if (currentDevices.length === 0) {
      message.warning('请先选择要压测的设备');
      return;
    }
    if (config.mode === 'count' && config.totalRequests < 1) {
      message.warning('总请求数至少为 1');
      return;
    }
    if (config.rawPayload.trim()) {
      try {
        JSON.parse(config.rawPayload);
      } catch {
        message.error('自定义 JSON 载荷格式不正确');
        return;
      }
    }
    const runner = new LoadRunner();
    runnerRef.current = runner;
    setSnapshot(EMPTY_SNAPSHOT);
    addLog('system', '压测中心', 'info', `开始压测：${currentDevices.length} 台设备，${config.mode === 'count' ? `${config.totalRequests} 次请求` : `${config.durationSec} 秒`}`);
    runner.start(currentDevices, config, {
      onSnapshot: setSnapshot,
      onEvent: (level, text) => addLog('system', '压测中心', level, text),
      onFinish: (finalSnapshot) => {
        setSnapshot(finalSnapshot);
        setHistory((previous) => [
          { id: String(Date.now()), at: Date.now(), config: { ...config }, deviceCount: currentDevices.length, snapshot: finalSnapshot },
          ...previous,
        ].slice(0, 20));
      },
    });
  };

  const handleStart = async () => {
    if (selectedDevices.length === 0) {
      message.warning('请先选择要压测的设备');
      return;
    }
    if (unsupportedSelected.length > 0) {
      message.error('视频/GB28181 设备不支持批量压测，请取消勾选');
      return;
    }
    const offlineDevices = selectedDevices.filter((device) => device.status !== 'online');
    if (offlineDevices.length > 0 && !autoConnect) {
      Modal.confirm({
        title: `${offlineDevices.length} 台设备当前离线`,
        content: '未开启自动连接时，离线设备的请求会直接失败。是否仍然开始？',
        okText: '仍然开始',
        onOk: startWithoutConnect,
      });
      return;
    }
    if (offlineDevices.length > 0 && autoConnect) {
      setStarting(true);
      setConnectProgress({ current: 0, total: offlineDevices.length });
      try {
        const result = await connectDevices(offlineDevices.map((device) => device.id), {
          concurrency: connectConcurrency,
          onProgress: (item) => setConnectProgress({ current: item.current, total: item.total }),
        });
        if (result.failed > 0) {
          message.warning(`有 ${result.failed} 台设备连接失败，压测将继续，失败请求会单独统计`);
        }
      } finally {
        setConnectProgress(null);
        setStarting(false);
      }
    }
    startWithoutConnect();
  };

  const progressPercent = config.mode === 'count'
    ? Math.min(100, Math.round((snapshot.sent / Math.max(1, config.totalRequests)) * 100))
    : Math.min(100, Math.round((snapshot.elapsedMs / Math.max(1, config.durationSec * 1000)) * 100));

  const exportReport = async () => {
    const report = {
      exportedAt: new Date().toISOString(),
      config,
      selectedDevices: selectedDevices.map((device) => ({ name: device.name, protocol: device.protocol, deviceName: device.deviceName })),
      snapshot,
      history,
    };
    const result = await window.electronAPI.fileExport(JSON.stringify(report, null, 2), `stress-report-${Date.now()}.json`);
    if (result.success) {
      message.success('压测报告已导出');
    } else if (result.message !== 'canceled') {
      message.error(result.message || '导出失败');
    }
  };

  const protocolColumns = [
    { title: '协议', dataIndex: 'protocol', width: 110, render: (value: string) => <Tag color={PROTOCOL_COLORS[value] || 'default'}>{value}</Tag> },
    { title: '发送', dataIndex: 'sent', width: 100 },
    { title: '成功', dataIndex: 'success', width: 100 },
    { title: '失败', dataIndex: 'failed', width: 100 },
    {
      title: '成功率',
      width: 100,
      render: (_: unknown, record: any) => `${record.sent > 0 ? ((record.success / record.sent) * 100).toFixed(1) : 0}%`,
    },
    { title: '平均延迟', dataIndex: 'avgLatency', width: 110, render: (value: number) => `${value}ms` },
    { title: 'P95', dataIndex: 'p95', width: 100, render: (value: number) => `${value}ms` },
  ];

  const protocolRows = Object.entries(snapshot.byProtocol).map(([protocol, metrics]) => ({ key: protocol, protocol, ...metrics }));
  const historyColumns = [
    { title: '时间', dataIndex: 'at', width: 180, render: (value: number) => new Date(value).toLocaleString() },
    { title: '设备数', dataIndex: 'deviceCount', width: 90 },
    { title: '请求', width: 90, render: (_: unknown, record: HistoryEntry) => record.snapshot.sent },
    { title: '成功', width: 90, render: (_: unknown, record: HistoryEntry) => record.snapshot.success },
    { title: '失败', width: 90, render: (_: unknown, record: HistoryEntry) => record.snapshot.failed },
    { title: 'TPS', width: 90, render: (_: unknown, record: HistoryEntry) => record.snapshot.tps },
    { title: 'P95', width: 90, render: (_: unknown, record: HistoryEntry) => `${record.snapshot.p95}ms` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        style={{ borderRadius: 18 }}
        title={(
          <Space direction="vertical" size={0}>
            <Title level={4} style={{ margin: 0 }}>压测中心</Title>
            <Text type="secondary">选择设备 → 配置负载 → 实时观测。支持 HTTP / MQTT / CoAP / WebSocket / TCP / UDP / LoRaWAN / SNMP / Modbus。</Text>
          </Space>
        )}
        extra={(
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setBulkCreateOpen(true)}>批量创建设备</Button>
            <Button icon={<DownloadOutlined />} onClick={() => void exportReport()} disabled={snapshot.sent === 0}>导出报告</Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Text strong>目标设备</Text>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
              style={{ minWidth: 520, flex: 1 }}
              placeholder="搜索并选择模拟设备"
              value={selectedIds}
              onChange={setSelectedIds}
              options={protocolGroups}
            />
            <Button size="small" onClick={() => setSelectedIds(devices.filter((device) => device.status === 'online').map((device) => device.id))}>
              选择在线设备
            </Button>
            <Button size="small" onClick={() => setSelectedIds(devices.filter((device) => LOAD_PROTOCOLS.includes(device.protocol as LoadProtocol)).map((device) => device.id))}>
              选择全部
            </Button>
            <Button size="small" onClick={() => setSelectedIds([])}>清空</Button>
          </Space>
          <Space size={8} wrap>
            <Tag color="blue">已选 {selectedDevices.length} 台</Tag>
            <Tag color="green">在线 {onlineSelected}</Tag>
            <Tag color={selectedDevices.length - onlineSelected > 0 ? 'orange' : 'default'}>离线 {selectedDevices.length - onlineSelected}</Tag>
            {selectedProtocols.map((protocol) => <Tag key={protocol} color={PROTOCOL_COLORS[protocol]}>{protocol}</Tag>)}
            {unsupportedSelected.length > 0 ? <Tag color="red">视频设备不支持压测</Tag> : null}
          </Space>
          <Alert
            type="info"
            showIcon
            message="视频 / GB28181 不参与批量压测"
            description="视频链路依赖摄像头、ffmpeg 与 SIP 会话，本机资源有限；请在设备详情中单台联调。"
          />
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title="负载模型" style={{ borderRadius: 16, height: '100%' }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Segmented
                value={config.mode}
                onChange={(value) => updateConfig({ mode: value as LoadConfig['mode'] })}
                options={[{ label: '固定请求数', value: 'count' }, { label: '持续时长', value: 'duration' }]}
                disabled={snapshot.running}
              />
              {config.mode === 'count' ? (
                <Space>
                  <Text style={{ width: 90 }}>总请求数</Text>
                  <InputNumber min={1} max={1000000} value={config.totalRequests} onChange={(value) => updateConfig({ totalRequests: Number(value) || 1 })} disabled={snapshot.running} style={{ width: 180 }} />
                  <Text type="secondary">按并发设备轮流发送</Text>
                </Space>
              ) : (
                <Space>
                  <Text style={{ width: 90 }}>持续时长</Text>
                  <InputNumber min={1} max={86400} value={config.durationSec} onChange={(value) => updateConfig({ durationSec: Number(value) || 1 })} disabled={snapshot.running} style={{ width: 180 }} addonAfter="秒" />
                </Space>
              )}
              <Space>
                <Text style={{ width: 90 }}>并发 Worker</Text>
                <InputNumber min={1} max={500} value={config.concurrency} onChange={(value) => updateConfig({ concurrency: Number(value) || 1 })} disabled={snapshot.running} style={{ width: 180 }} />
                <Text type="secondary">每个 Worker 按间隔循环发送</Text>
              </Space>
              <Space>
                <Text style={{ width: 90 }}>发送间隔</Text>
                <InputNumber min={0} max={60000} value={config.intervalMs} onChange={(value) => updateConfig({ intervalMs: Number(value) || 0 })} disabled={snapshot.running} style={{ width: 180 }} addonAfter="ms" />
              </Space>
              <Space>
                <Text style={{ width: 90 }}>爬坡时间</Text>
                <InputNumber min={0} max={3600} value={config.rampUpSec} onChange={(value) => updateConfig({ rampUpSec: Number(value) || 0 })} disabled={snapshot.running} style={{ width: 180 }} addonAfter="秒" />
              </Space>
              <Space>
                <Text style={{ width: 90 }}>超时时间</Text>
                <InputNumber min={1000} max={120000} value={config.timeoutMs} onChange={(value) => updateConfig({ timeoutMs: Number(value) || 10000 })} disabled={snapshot.running} style={{ width: 180 }} addonAfter="ms" />
              </Space>
              <Space>
                <Text style={{ width: 90 }}>自动连接</Text>
                <Select
                  value={autoConnect ? 'yes' : 'no'}
                  onChange={(value) => setAutoConnect(value === 'yes')}
                  options={[{ value: 'yes', label: '开始前连接离线设备' }, { value: 'no', label: '仅压测在线设备' }]}
                  disabled={snapshot.running}
                  style={{ width: 220 }}
                />
                <InputNumber min={1} max={100} value={connectConcurrency} onChange={(value) => setConnectConcurrency(Number(value) || 10)} disabled={!autoConnect || snapshot.running} addonAfter="并发" style={{ width: 140 }} />
              </Space>
              {connectProgress ? (
                <Progress percent={Math.round((connectProgress.current / Math.max(1, connectProgress.total)) * 100)} status="active" />
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="发送内容" style={{ borderRadius: 16, height: '100%' }}>
            <Form layout="vertical" size="small">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="上报类型" style={{ marginBottom: 10 }}>
                    <Select
                      value={config.reportType}
                      onChange={(value) => updateConfig({ reportType: value })}
                      options={[{ value: 'property', label: '属性上报' }, { value: 'event', label: '事件上报' }]}
                      disabled={snapshot.running}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="数据模板" style={{ marginBottom: 10 }}>
                    <Select
                      value={config.templateId}
                      onChange={(value) => updateConfig({ templateId: value })}
                      options={templates.map((template) => ({ value: template.id, label: `${template.name}（${template.type}）` }))}
                      disabled={snapshot.running}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="自定义 JSON 载荷（可选，填写后覆盖模板）" style={{ marginBottom: 8 }}>
                <Input.TextArea
                  rows={3}
                  value={config.rawPayload}
                  onChange={(event) => updateConfig({ rawPayload: event.target.value })}
                  placeholder='{"temperature": 26.5, "humidity": 60}'
                  disabled={snapshot.running}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
              <Collapse
                size="small"
                items={[{
                  key: 'protocol',
                  label: '协议专属参数',
                  children: (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {selectedProtocols.includes('MQTT') || selectedProtocols.length === 0 ? (
                        <Form.Item label="MQTT Topic" style={{ marginBottom: 0 }}>
                          <Input value={config.mqttTopic} onChange={(event) => updateConfig({ mqttTopic: event.target.value })} disabled={snapshot.running} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>
                      ) : null}
                      {selectedProtocols.includes('WebSocket') ? (
                        <Form.Item label="WebSocket 消息模板" style={{ marginBottom: 0 }} extra="支持 {deviceName} / {productKey} / {seq} / {timestamp}">
                          <Input.TextArea rows={2} value={config.wsMessage} onChange={(event) => updateConfig({ wsMessage: event.target.value })} disabled={snapshot.running} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>
                      ) : null}
                      {selectedProtocols.includes('TCP') ? (
                        <Form.Item label="TCP 消息模板" style={{ marginBottom: 0 }} extra="默认追加换行，按行分隔">
                          <Input.TextArea rows={2} value={config.tcpMessage} onChange={(event) => updateConfig({ tcpMessage: event.target.value })} disabled={snapshot.running} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>
                      ) : null}
                      {selectedProtocols.includes('UDP') ? (
                        <Form.Item label="UDP 消息模板" style={{ marginBottom: 0 }}>
                          <Input.TextArea rows={2} value={config.udpMessage} onChange={(event) => updateConfig({ udpMessage: event.target.value })} disabled={snapshot.running} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>
                      ) : null}
                      {selectedProtocols.includes('LoRaWAN') ? (
                        <Space>
                          <Text>FPort</Text>
                          <InputNumber min={1} max={255} value={config.loraFPort} onChange={(value) => updateConfig({ loraFPort: Number(value) || 1 })} disabled={snapshot.running} />
                        </Space>
                      ) : null}
                      {selectedProtocols.includes('SNMP') ? (
                        <Form.Item label="SNMP OID（逗号分隔）" style={{ marginBottom: 0 }}>
                          <Input value={config.snmpOids} onChange={(event) => updateConfig({ snmpOids: event.target.value })} disabled={snapshot.running} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>
                      ) : null}
                      {selectedProtocols.includes('Modbus') ? (
                        <Space wrap>
                          <Text>功能码</Text>
                          <Select
                            value={config.modbusFunction}
                            onChange={(value) => updateConfig({ modbusFunction: value })}
                            options={[{ value: 3, label: 'FC03 保持寄存器' }, { value: 4, label: 'FC04 输入寄存器' }]}
                            disabled={snapshot.running}
                            style={{ width: 160 }}
                          />
                          <Text>起始地址</Text>
                          <InputNumber min={0} max={65535} value={config.modbusAddress} onChange={(value) => updateConfig({ modbusAddress: Number(value) || 0 })} disabled={snapshot.running} />
                          <Text>数量</Text>
                          <InputNumber min={1} max={125} value={config.modbusQuantity} onChange={(value) => updateConfig({ modbusQuantity: Number(value) || 1 })} disabled={snapshot.running} />
                        </Space>
                      ) : null}
                      {selectedProtocols.length === 0 ? <Text type="secondary">选择设备后显示对应协议的参数。</Text> : null}
                    </Space>
                  ),
                }]}
              />
            </Form>
          </Card>
        </Col>
      </Row>

      <Card
        title="运行控制"
        style={{ borderRadius: 16 }}
        extra={(
          <Space>
            {!snapshot.running && !snapshot.paused ? (
              <Button type="primary" size="large" icon={<ThunderboltOutlined />} loading={starting} onClick={() => void handleStart()}>
                开始压测
              </Button>
            ) : null}
            {snapshot.running && !snapshot.paused ? (
              <Button size="large" icon={<PauseCircleOutlined />} onClick={() => runnerRef.current?.pause()}>暂停</Button>
            ) : null}
            {snapshot.paused ? (
              <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={() => runnerRef.current?.resume()}>继续</Button>
            ) : null}
            {snapshot.running || snapshot.paused ? (
              <Button danger size="large" icon={<StopOutlined />} onClick={() => runnerRef.current?.stop()}>停止</Button>
            ) : null}
            <Button size="large" icon={<ReloadOutlined />} onClick={() => setSnapshot(EMPTY_SNAPSHOT)} disabled={snapshot.running}>清空结果</Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Progress percent={progressPercent} status={snapshot.running ? 'active' : snapshot.done ? 'success' : 'normal'} />
          <Row gutter={16}>
            <Col span={4}><Statistic title="已发送" value={snapshot.sent} /></Col>
            <Col span={4}><Statistic title="成功" value={snapshot.success} valueStyle={{ color: '#16a34a' }} /></Col>
            <Col span={4}><Statistic title="失败" value={snapshot.failed} valueStyle={{ color: '#dc2626' }} /></Col>
            <Col span={4}><Statistic title="TPS" value={snapshot.tps} precision={1} /></Col>
            <Col span={4}><Statistic title="成功率" value={snapshot.successRate} precision={1} suffix="%" /></Col>
            <Col span={4}><Statistic title="进行中" value={snapshot.inFlight} /></Col>
          </Row>
          <Row gutter={16}>
            <Col span={4}><Statistic title="耗时" value={formatDuration(snapshot.elapsedMs)} /></Col>
            <Col span={4}><Statistic title="平均延迟" value={snapshot.avgLatency} suffix="ms" /></Col>
            <Col span={4}><Statistic title="P50" value={snapshot.p50} suffix="ms" /></Col>
            <Col span={4}><Statistic title="P95" value={snapshot.p95} suffix="ms" /></Col>
            <Col span={4}><Statistic title="P99" value={snapshot.p99} suffix="ms" /></Col>
            <Col span={4}><Statistic title="最大延迟" value={snapshot.maxLatency} suffix="ms" /></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" title="TPS 趋势">
                <MiniSparkline values={snapshot.timeline.map((item) => item.tps)} />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="失败趋势">
                <MiniSparkline values={snapshot.timeline.map((item) => item.failed)} color="#dc2626" />
              </Card>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={14}>
              <Card size="small" title="协议分布">
                {protocolRows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> : (
                  <Table rowKey="key" size="small" pagination={false} columns={protocolColumns} dataSource={protocolRows} />
                )}
              </Card>
            </Col>
            <Col span={10}>
              <Card size="small" title="错误 Top">
                {snapshot.errors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无错误" /> : (
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    {snapshot.errors.map((item) => (
                      <Space key={item.message} align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text style={{ maxWidth: 420 }} ellipsis={{ tooltip: item.message }} type="danger">{item.message}</Text>
                        <Tag color="red">{item.count}</Tag>
                      </Space>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card
        title="压测历史"
        style={{ borderRadius: 16 }}
        extra={<Text type="secondary">最近 {history.length} 次（仅本会话）</Text>}
      >
        {history.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成一次压测后可在这里对比结果" />
        ) : (
          <Table rowKey="id" size="small" columns={historyColumns} dataSource={history} pagination={false} />
        )}
      </Card>

      <BulkCreateDevicesDrawer
        open={bulkCreateOpen}
        onClose={() => setBulkCreateOpen(false)}
        onCreated={(ids) => setSelectedIds(ids)}
      />
    </div>
  );
}
