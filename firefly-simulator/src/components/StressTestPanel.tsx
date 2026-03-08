import { useRef, useState } from 'react';
import {
  Button, Space, Tag, Typography, Empty,
  Modal, Input, Select, InputNumber, Tooltip,
  Card, Statistic, Row, Col, Progress, Radio, message,
} from 'antd';
import {
  PlusOutlined, ThunderboltOutlined, PauseCircleOutlined,
  ExperimentOutlined, DashboardOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useSimStore, generatePayload } from '../store';

const { Text } = Typography;

interface StressStats {
  total: number;
  sent: number;
  success: number;
  failed: number;
  startTime: number;
  endTime: number;
  latencies: number[];
  byProtocol: Record<string, { sent: number; success: number; failed: number; latencies: number[] }>;
}

const emptyStats = (): StressStats => ({ total: 0, sent: 0, success: 0, failed: 0, startTime: 0, endTime: 0, latencies: [], byProtocol: {} });

export default function StressTestPanel() {
  const { devices, addLog, updateDevice, templates, addDevice } = useSimStore();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<StressStats>(emptyStats());
  const [config, setConfig] = useState({
    count: 10,
    templateId: 'tpl-temp-humidity',
    rounds: 5,
    intervalMs: 200,
    mqttTopic: '/sys/{productKey}/{deviceName}/thing/property/post',
  });
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchConfig, setBatchConfig] = useState({ count: 5, protocol: 'MQTT' as string, prefix: '压测设备' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [testHistory, setTestHistory] = useState<Array<StressStats & { config: typeof config }>>([]);
  const abortRef = useRef(false);

  const onlineDevices = devices.filter((d) => d.status === 'online');

  const runStressTest = async () => {
    if (onlineDevices.length === 0) {
      message.warning('没有在线设备，请先连接设备');
      return;
    }

    const tpl = templates.find((t) => t.id === config.templateId);
    if (!tpl) {
      message.error('请选择数据模板');
      return;
    }

    setRunning(true);
    abortRef.current = false;
    const total = Math.min(onlineDevices.length, config.count) * config.rounds;
    const newStats: StressStats = emptyStats();
    newStats.total = total;
    newStats.startTime = Date.now();
    setStats(newStats);
    addLog('system', '压力测试', 'info', `开始压测: ${Math.min(onlineDevices.length, config.count)} 设备 × ${config.rounds} 轮 = ${total} 请求`);

    const targetDevices = onlineDevices.slice(0, config.count);

    for (let round = 0; round < config.rounds; round++) {
      if (abortRef.current) break;

      const promises = targetDevices.map(async (dev) => {
        if (abortRef.current) return;
        const payload = generatePayload(tpl.fields);
        const t0 = Date.now();
        try {
          let res: any;
          if (dev.protocol === 'MQTT') {
            const topic = config.mqttTopic
              .replace('{productKey}', dev.mqttUsername || 'product')
              .replace('{deviceName}', dev.mqttClientId);
            res = await window.electronAPI.mqttPublish(dev.id, topic, JSON.stringify(payload), 1);
          } else if (dev.protocol === 'CoAP') {
            res = tpl.type === 'event'
              ? await window.electronAPI.coapReportEvent(dev.coapBaseUrl, dev.token, payload)
              : await window.electronAPI.coapReportProperty(dev.coapBaseUrl, dev.token, payload);
          } else {
            res = tpl.type === 'event'
              ? await window.electronAPI.httpReportEvent(dev.httpBaseUrl, dev.token, payload)
              : await window.electronAPI.httpReportProperty(dev.httpBaseUrl, dev.token, payload);
          }
          const lat = Date.now() - t0;
          setStats((prev) => {
            const n = { ...prev, sent: prev.sent + 1, latencies: [...prev.latencies, lat] };
            if (res.success) n.success++;
            else n.failed++;
            const proto = dev.protocol;
            const pp = n.byProtocol[proto] || { sent: 0, success: 0, failed: 0, latencies: [] };
            pp.sent++;
            if (res.success) pp.success++; else pp.failed++;
            pp.latencies = [...pp.latencies, lat];
            n.byProtocol = { ...n.byProtocol, [proto]: pp };
            return n;
          });
          updateDevice(dev.id, { sentCount: dev.sentCount + 1 });
        } catch {
          const lat = Date.now() - t0;
          setStats((prev) => {
            const n = { ...prev, sent: prev.sent + 1, failed: prev.failed + 1, latencies: [...prev.latencies, lat] };
            const proto = dev.protocol;
            const pp = n.byProtocol[proto] || { sent: 0, success: 0, failed: 0, latencies: [] };
            pp.sent++; pp.failed++;
            pp.latencies = [...pp.latencies, lat];
            n.byProtocol = { ...n.byProtocol, [proto]: pp };
            return n;
          });
          updateDevice(dev.id, { errorCount: dev.errorCount + 1 });
        }
      });

      await Promise.all(promises);

      if (round < config.rounds - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, config.intervalMs));
      }
    }

    setStats((prev) => {
      const final = { ...prev, endTime: Date.now() };
      setTestHistory((h) => [...h, { ...final, config: { ...config } }]);
      return final;
    });
    setRunning(false);
    const elapsed = (Date.now() - newStats.startTime) / 1000;
    addLog('system', '压力测试', 'success', `压测完成: 耗时 ${elapsed.toFixed(1)}s`);
  };

  const batchCreateDevices = () => {
    const { count, protocol, prefix } = batchConfig;
    for (let i = 0; i < count; i++) {
      addDevice({
        name: `${prefix}-${String(i + 1).padStart(3, '0')}`,
        protocol: protocol as any,
      });
    }
    message.success(`已创建 ${count} 台 ${protocol} 设备`);
    addLog('system', '压力测试', 'info', `批量创建 ${count} 台 ${protocol} 设备`);
    setBatchOpen(false);
  };

  const stopTest = () => {
    abortRef.current = true;
    addLog('system', '压力测试', 'warn', '压测已手动停止');
  };

  const elapsed = stats.endTime ? (stats.endTime - stats.startTime) / 1000 : stats.startTime ? (Date.now() - stats.startTime) / 1000 : 0;
  const tps = elapsed > 0 ? (stats.sent / elapsed).toFixed(1) : '0';
  const successRate = stats.sent > 0 ? ((stats.success / stats.sent) * 100).toFixed(1) : '0';

  return (
    <>
      <Tooltip title="压力测试">
        <Button size="small" icon={<ExperimentOutlined />} onClick={() => setOpen(true)} style={{ marginBottom: 8 }} />
      </Tooltip>
      <Modal
        title={<Space><DashboardOutlined />压力测试</Space>}
        open={open}
        onCancel={() => !running && setOpen(false)}
        footer={null}
        width={560}
        maskClosable={!running}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space>
                <Text style={{ fontSize: 13, width: 80, display: 'inline-block' }}>并发设备数:</Text>
                <InputNumber min={1} max={100} value={config.count} onChange={(v) => setConfig((c) => ({ ...c, count: v || 10 }))} disabled={running} style={{ width: 100 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>(在线 {onlineDevices.length} 台: HTTP {onlineDevices.filter(d=>d.protocol==='HTTP').length} / MQTT {onlineDevices.filter(d=>d.protocol==='MQTT').length} / CoAP {onlineDevices.filter(d=>d.protocol==='CoAP').length}{onlineDevices.filter(d=>d.protocol==='Modbus').length > 0 ? ` / Modbus ${onlineDevices.filter(d=>d.protocol==='Modbus').length}` : ''}{onlineDevices.filter(d=>d.protocol==='WebSocket').length > 0 ? ` / WS ${onlineDevices.filter(d=>d.protocol==='WebSocket').length}` : ''}{onlineDevices.filter(d=>d.protocol==='TCP').length > 0 ? ` / TCP ${onlineDevices.filter(d=>d.protocol==='TCP').length}` : ''}{onlineDevices.filter(d=>d.protocol==='UDP').length > 0 ? ` / UDP ${onlineDevices.filter(d=>d.protocol==='UDP').length}` : ''}{onlineDevices.filter(d=>d.protocol==='LoRaWAN').length > 0 ? ` / LoRa ${onlineDevices.filter(d=>d.protocol==='LoRaWAN').length}` : ''})</Text>
              </Space>
              <Space>
                <Text style={{ fontSize: 13, width: 80, display: 'inline-block' }}>发送轮次:</Text>
                <InputNumber min={1} max={1000} value={config.rounds} onChange={(v) => setConfig((c) => ({ ...c, rounds: v || 5 }))} disabled={running} style={{ width: 100 }} />
              </Space>
              <Space>
                <Text style={{ fontSize: 13, width: 80, display: 'inline-block' }}>轮次间隔:</Text>
                <InputNumber min={0} max={10000} value={config.intervalMs} onChange={(v) => setConfig((c) => ({ ...c, intervalMs: v || 200 }))} disabled={running} style={{ width: 100 }} addonAfter="ms" />
              </Space>
              <Space>
                <Text style={{ fontSize: 13, width: 80, display: 'inline-block' }}>数据模板:</Text>
                <Select
                  value={config.templateId}
                  onChange={(v) => setConfig((c) => ({ ...c, templateId: v }))}
                  disabled={running}
                  style={{ width: 200 }}
                  options={templates.map((t) => ({ label: `${t.name} (${t.type})`, value: t.id }))}
                />
              </Space>
              <Space>
                <Text style={{ fontSize: 13, width: 80, display: 'inline-block' }}>MQTT Topic:</Text>
                <Input
                  size="small"
                  value={config.mqttTopic}
                  onChange={(e) => setConfig((c) => ({ ...c, mqttTopic: e.target.value }))}
                  disabled={running}
                  style={{ width: 340 }}
                  placeholder="/sys/{productKey}/{deviceName}/thing/property/post"
                />
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>MQTT Topic 支持 {'{productKey}'} 和 {'{deviceName}'} 占位符，自动替换为设备参数</Text>
            </Space>
          </Card>

          {/* Stats Dashboard */}
          <Row gutter={16}>
            <Col span={6}><Statistic title="总请求" value={stats.total} valueStyle={{ fontSize: 20 }} /></Col>
            <Col span={6}><Statistic title="已发送" value={stats.sent} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Col>
            <Col span={6}><Statistic title="成功" value={stats.success} valueStyle={{ fontSize: 20, color: '#52c41a' }} /></Col>
            <Col span={6}><Statistic title="失败" value={stats.failed} valueStyle={{ fontSize: 20, color: '#ff4d4f' }} /></Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}><Statistic title="TPS" value={tps} suffix="req/s" valueStyle={{ fontSize: 18 }} /></Col>
            <Col span={6}><Statistic title="成功率" value={successRate} suffix="%" valueStyle={{ fontSize: 18, color: Number(successRate) >= 99 ? '#52c41a' : Number(successRate) >= 90 ? '#faad14' : '#ff4d4f' }} /></Col>
            <Col span={6}><Statistic title="耗时" value={elapsed.toFixed(1)} suffix="s" valueStyle={{ fontSize: 18 }} /></Col>
            <Col span={6}><Statistic title="平均延迟" value={stats.latencies.length > 0 ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length) : 0} suffix="ms" valueStyle={{ fontSize: 18 }} /></Col>
          </Row>

          {/* Latency percentiles */}
          {stats.latencies.length > 0 && (() => {
            const sorted = [...stats.latencies].sort((a, b) => a - b);
            const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)] || 0;
            return (
              <div style={{ fontSize: 11, display: 'flex', gap: 12, padding: '4px 0', flexWrap: 'wrap' }}>
                <Text type="secondary">P50: <Text strong>{p(50)}ms</Text></Text>
                <Text type="secondary">P90: <Text strong>{p(90)}ms</Text></Text>
                <Text type="secondary">P95: <Text strong>{p(95)}ms</Text></Text>
                <Text type="secondary">P99: <Text strong>{p(99)}ms</Text></Text>
                <Text type="secondary">最小: <Text strong>{sorted[0]}ms</Text></Text>
                <Text type="secondary">最大: <Text strong>{sorted[sorted.length - 1]}ms</Text></Text>
              </div>
            );
          })()}

          {/* Per-protocol breakdown */}
          {Object.keys(stats.byProtocol).length > 0 && (
            <Card size="small" title={<Text style={{ fontSize: 12 }}>协议分布</Text>} style={{ marginTop: -8 }}>
              {Object.entries(stats.byProtocol).map(([proto, ps]) => {
                const avg = ps.latencies.length > 0 ? Math.round(ps.latencies.reduce((a, b) => a + b, 0) / ps.latencies.length) : 0;
                const rate = ps.sent > 0 ? ((ps.success / ps.sent) * 100).toFixed(0) : '0';
                return (
                  <div key={proto} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, fontSize: 11 }}>
                    <Tag color={proto === 'MQTT' ? 'green' : proto === 'CoAP' ? 'orange' : 'blue'} style={{ fontSize: 10, width: 50, textAlign: 'center' }}>{proto}</Tag>
                    <Text>发送: <Text strong>{ps.sent}</Text></Text>
                    <Text style={{ color: '#52c41a' }}>成功: {ps.success}</Text>
                    <Text style={{ color: '#ff4d4f' }}>失败: {ps.failed}</Text>
                    <Text type="secondary">成功率: {rate}%</Text>
                    <Text type="secondary">平均延迟: {avg}ms</Text>
                  </div>
                );
              })}
            </Card>
          )}

          {running && <Progress percent={stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0} status="active" />}

          <Space wrap>
            {!running ? (
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={runStressTest} disabled={onlineDevices.length === 0}>
                开始压测
              </Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={stopTest}>停止</Button>
            )}
            <Button icon={<PlusOutlined />} onClick={() => setBatchOpen(true)} disabled={running}>批量创建设备</Button>
            {testHistory.length > 0 && (
              <>
                <Button size="small" onClick={() => setHistoryOpen(true)}>历史记录 ({testHistory.length})</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={async () => {
                  const lines = testHistory.map((h, i) => {
                    const dur = ((h.endTime - h.startTime) / 1000).toFixed(1);
                    const t = h.latencies.length > 0 ? Math.round(h.latencies.reduce((a, b) => a + b, 0) / h.latencies.length) : 0;
                    const sorted = [...h.latencies].sort((a, b) => a - b);
                    const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)] || 0;
                    let text = `#${i + 1} | ${new Date(h.startTime).toLocaleString()} | ${h.config.count}设备 × ${h.config.rounds}轮\n`;
                    text += `总计: ${h.total} | 发送: ${h.sent} | 成功: ${h.success} | 失败: ${h.failed}\n`;
                    text += `耗时: ${dur}s | TPS: ${(h.sent / Number(dur)).toFixed(1)} | 成功率: ${h.sent > 0 ? ((h.success / h.sent) * 100).toFixed(1) : 0}%\n`;
                    text += `延迟 — 平均: ${t}ms | P50: ${p(50)}ms | P90: ${p(90)}ms | P95: ${p(95)}ms | P99: ${p(99)}ms\n`;
                    Object.entries(h.byProtocol).forEach(([proto, ps]) => {
                      const pavg = ps.latencies.length > 0 ? Math.round(ps.latencies.reduce((a, b) => a + b, 0) / ps.latencies.length) : 0;
                      text += `  ${proto}: 发送 ${ps.sent} | 成功 ${ps.success} | 失败 ${ps.failed} | 平均延迟 ${pavg}ms\n`;
                    });
                    return text;
                  });
                  await window.electronAPI.fileExport(lines.join('\n---\n\n'), `stress-test-${Date.now()}.txt`);
                }}>导出全部</Button>
              </>
            )}
          </Space>
        </Space>
      </Modal>

      {/* Batch Device Creation Modal */}
      <Modal
        title="批量创建设备"
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={batchCreateDevices}
        okText="创建"
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Text style={{ fontSize: 13, width: 60, display: 'inline-block' }}>数量:</Text>
            <InputNumber min={1} max={50} value={batchConfig.count} onChange={(v) => setBatchConfig((c) => ({ ...c, count: v || 5 }))} style={{ width: 100 }} />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, width: 60, display: 'inline-block' }}>协议:</Text>
            <Radio.Group value={batchConfig.protocol} onChange={(e) => setBatchConfig((c) => ({ ...c, protocol: e.target.value }))}>
              <Radio.Button value="HTTP">HTTP</Radio.Button>
              <Radio.Button value="MQTT">MQTT</Radio.Button>
              <Radio.Button value="CoAP">CoAP</Radio.Button>
              <Radio.Button value="WebSocket">WebSocket</Radio.Button>
              <Radio.Button value="TCP">TCP</Radio.Button>
              <Radio.Button value="UDP">UDP</Radio.Button>
              <Radio.Button value="LoRaWAN">LoRaWAN</Radio.Button>
            </Radio.Group>
          </Space>
          <Space>
            <Text style={{ fontSize: 13, width: 60, display: 'inline-block' }}>前缀:</Text>
            <Input value={batchConfig.prefix} onChange={(e) => setBatchConfig((c) => ({ ...c, prefix: e.target.value }))} style={{ width: 200 }} placeholder="压测设备" />
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }}>将创建 {batchConfig.count} 台 {batchConfig.protocol} 设备，名称格式: {batchConfig.prefix}-001, {batchConfig.prefix}-002, ...</Text>
        </Space>
      </Modal>

      {/* Test History Modal */}
      <Modal
        title="压测历史记录"
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width={620}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {testHistory.length === 0 ? <Empty description="暂无记录" /> : testHistory.slice().reverse().map((h, i) => {
            const dur = ((h.endTime - h.startTime) / 1000).toFixed(1);
            const avgLat = h.latencies.length > 0 ? Math.round(h.latencies.reduce((a, b) => a + b, 0) / h.latencies.length) : 0;
            const sorted = [...h.latencies].sort((a, b) => a - b);
            const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
            return (
              <Card key={i} size="small" style={{ marginBottom: 8 }}
                title={<Text style={{ fontSize: 12 }}>#{testHistory.length - i} — {new Date(h.startTime).toLocaleString()}</Text>}
                extra={<Text type="secondary" style={{ fontSize: 11 }}>{h.config.count}设备 × {h.config.rounds}轮</Text>}
              >
                <div style={{ display: 'flex', gap: 16, fontSize: 11, flexWrap: 'wrap' }}>
                  <Text>总计: <Text strong>{h.total}</Text></Text>
                  <Text style={{ color: '#52c41a' }}>成功: {h.success}</Text>
                  <Text style={{ color: '#ff4d4f' }}>失败: {h.failed}</Text>
                  <Text>TPS: <Text strong>{(h.sent / Number(dur)).toFixed(1)}</Text></Text>
                  <Text>耗时: {dur}s</Text>
                  <Text>平均延迟: {avgLat}ms</Text>
                  <Text>P90: {p90}ms</Text>
                </div>
                {Object.entries(h.byProtocol).length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 10 }}>
                    {Object.entries(h.byProtocol).map(([proto, ps]) => (
                      <Tag key={proto} color={proto === 'MQTT' ? 'green' : proto === 'CoAP' ? 'orange' : proto === 'WebSocket' ? 'volcano' : proto === 'TCP' ? 'magenta' : proto === 'UDP' ? 'lime' : proto === 'LoRaWAN' ? 'gold' : 'blue'} style={{ fontSize: 10 }}>
                        {proto}: {ps.success}/{ps.sent}
                      </Tag>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
